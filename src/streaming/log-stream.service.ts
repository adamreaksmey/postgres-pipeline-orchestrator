import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Pool, PoolClient } from 'pg';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';
import { JobLog } from 'src/database/entities/job-log.entity';

const LOG_CHANNEL = 'job_logs';

const JOB_LOGS_NOTIFY_TRIGGER_SQL = `
CREATE OR REPLACE FUNCTION notify_job_log_insert()
RETURNS TRIGGER AS $$
DECLARE
  payload text;
  line_trunc text;
BEGIN
  line_trunc := left(NEW.log_line, 7000);
  IF length(NEW.log_line) > 7000 THEN
    line_trunc := line_trunc || '…';
  END IF;
  payload := json_build_object(
    'job_id', NEW.job_id,
    'log_line', line_trunc,
    'log_level', coalesce(NEW.log_level, 'info'),
    'timestamp', NEW.timestamp,
    'id', NEW.id
  )::text;
  PERFORM pg_notify('job_logs', payload);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_logs_notify ON job_logs;
CREATE TRIGGER job_logs_notify
  AFTER INSERT ON job_logs
  FOR EACH ROW
  EXECUTE FUNCTION notify_job_log_insert();
`;

export interface LogStreamEvent {
  job_id: string;
  log_line: string;
  log_level: string;
  timestamp: string;
  id?: string;
}

/**
 * Real-time log streaming: DB is source of truth + event emitter.
 * - Postgres trigger on job_logs NOTIFYs on INSERT; this service only LISTENs and forwards.
 * - appendLog() only INSERTs; the trigger does NOTIFY. No app-side publishing.
 */
@Injectable()
export class LogStreamService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool | null = null;
  private listenClient: PoolClient | null = null;
  private readonly logSubject = new Subject<LogStreamEvent>();

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  private getPool(): Pool {
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: this.configService.getOrThrow<string>('DATABASE_URL'),
      });
    }
    return this.pool;
  }

  async onModuleInit(): Promise<void> {
    await this.ensureNotifyTrigger();
    await this.startListening();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.listenClient) {
      this.listenClient.release();
      this.listenClient = null;
    }
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.logSubject.complete();
  }

  /**
   * Ensure Postgres trigger exists: NOTIFY on INSERT into job_logs (DB as event emitter).
   */
  private async ensureNotifyTrigger(): Promise<void> {
    await this.dataSource.query(JOB_LOGS_NOTIFY_TRIGGER_SQL);
  }

  /**
   * Dedicated connection that LISTENs to job_logs; Postgres sends NOTIFY from trigger.
   */
  private async startListening(): Promise<void> {
    const pool = this.getPool();
    this.listenClient = await pool.connect();

    this.listenClient.on('notification', (msg) => {
      if (msg.channel !== LOG_CHANNEL || !msg.payload) return;
      try {
        const event = JSON.parse(msg.payload) as LogStreamEvent;
        this.logSubject.next(event);
      } catch {}
    });

    const restart = async () => {
      try {
        this.listenClient?.release();
      } catch {}
      this.listenClient = null;
      setTimeout(() => this.startListening(), 1000);
    };

    this.listenClient.on('error', restart);
    this.listenClient.on('end', restart);

    await this.listenClient.query(`LISTEN "${LOG_CHANNEL}"`);
  }

  getLogStream(): Observable<LogStreamEvent> {
    return this.logSubject.asObservable();
  }

  getLogStreamForJob(jobId: string): Observable<LogStreamEvent> {
    return this.logSubject.pipe(filter((ev) => ev.job_id === jobId));
  }

  /**
   * Persist a log line only. Postgres trigger NOTIFYs; we do not publish from the app.
   */
  async appendLog(jobId: string, logLine: string, logLevel = 'info'): Promise<{ id: string }> {
    const repo = this.dataSource.getRepository(JobLog);
    const log = repo.create({
      job_id: jobId,
      log_line: logLine,
      log_level: logLevel,
    });
    const saved = await repo.save(log);
    return { id: saved.id };
  }
}
