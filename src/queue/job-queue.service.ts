import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Job } from 'src/database/entities/job.entity';

@Injectable()
export class JobQueueService {
  constructor(private readonly dataSource: DataSource) {}

  async insertNewJob(
    pipelineRunId: string,
    stage: string,
    stepName: string,
    command: string,
    priority: number,
  ) {
    const job = this.dataSource.manager.create(Job, {
      pipeline_run_id: pipelineRunId,
      stage,
      step_name: stepName,
      command,
      status: 'pending',
      priority,
      retry_count: 0,
      max_retries: 3,
      created_at: new Date(),
    });

    return this.dataSource.manager.save(job);
  }

  async claimNextJob(workerId: string): Promise<Job | null> {
    const result = await this.dataSource.query(
      `
      UPDATE jobs
      SET claimed_by = $1,
          claimed_at = NOW(),
          heartbeat_at = NOW(),
          started_at = NOW(),
          status = 'running'
      WHERE id = (
        SELECT id
        FROM jobs
        WHERE status = 'pending'
        ORDER BY priority DESC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *;
      `,
      [workerId],
    );

    return result[0] ?? null;
  }

  async updateHeartbeat(jobId: string) {
    await this.dataSource.query(`UPDATE jobs SET heartbeat_at = NOW() WHERE id = $1`, [jobId]);
  }

  /** Mark job as success (exit 0). Pipeline run status is updated by DB trigger. */
  async markCompleted(jobId: string, exitCode: number) {
    await this.dataSource.query(
      `
      UPDATE jobs
      SET status = 'success',
          exit_code = $2,
          completed_at = NOW()
      WHERE id = $1
      `,
      [jobId, exitCode],
    );
  }

  async markFailed(jobId: string, exitCode: number) {
    await this.dataSource.query(
      `
      UPDATE jobs
      SET status = CASE
            WHEN retry_count + 1 >= max_retries THEN 'failed'
            ELSE 'pending'
          END,
          retry_count = retry_count + 1,
          exit_code = $2,
          claimed_by = NULL,
          claimed_at = NULL
      WHERE id = $1
      `,
      [jobId, exitCode],
    );
  }

  /**
   * reclaiming stuck jobs from dead workers.
   * note for dev:
   * basically how the heartbeat_at expiration works here is that if the heartbeat continues to beat
   * outside of the allowed timeframe ( value determined by the timeoutSeconds parameter), then the job is considered dead.
   * @param timeoutSeconds - the amount of time in seconds that the heartbeat is allowed to beat outside of the allowed timeframe.
   */
  async reclaimStuckJobs(timeoutSeconds: number) {
    await this.dataSource.query(
      `
      UPDATE jobs
      SET status = 'pending',
          claimed_by = NULL,
          claimed_at = NULL,
          retry_count = retry_count + 1
      WHERE status = 'running'
        AND heartbeat_at < NOW() - ($1::text || ' seconds')::interval
        AND retry_count < max_retries
      `,
      [timeoutSeconds],
    );
  }
}
