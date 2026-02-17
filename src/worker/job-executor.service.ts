import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { Job } from 'src/database/entities/job.entity';
import { DeploymentLockService } from 'src/locks/deployment-lock.service';
import { HeartbeatService } from './heartbeat.service';
import { LogStreamService } from 'src/streaming/log-stream.service';

function guessDeployEnvironment(job: Job): string {
  // blueprint uses: "./deploy.sh production" / "./deploy.sh staging"
  const cmd = job.command?.trim() ?? '';
  const tokens = cmd.split(/\s+/).filter(Boolean);
  const last = tokens.at(-1);
  if (last && ['production', 'staging', 'dev', 'test'].includes(last)) return last;

  if (cmd.includes('production')) return 'production';
  if (cmd.includes('staging')) return 'staging';
  return 'production';
}

/**
 * Executes a job command and streams logs.
 * Deploy jobs are guarded by PostgreSQL advisory locks via DeploymentLockService.
 */
@Injectable()
export class JobExecutorService {
  constructor(
    private readonly heartbeat: HeartbeatService,
    private readonly locks: DeploymentLockService,
    private readonly logStream: LogStreamService,
  ) {}

  /**
   * Execute a single job (shell command). Returns the exit code.
   * Caller is responsible for marking the job completed/failed in the queue.
   */
  async execute(job: Job, workerId: string): Promise<number> {
    let lockRelease: (() => Promise<void>) | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    try {
      if (job.stage === 'deploy') {
        const env = guessDeployEnvironment(job);
        const lock = await this.locks.tryAcquire(env);
        if (!lock.acquired) {
          await this.logStream.appendLog(job.id, `Deploy lock busy for ${env}; skipping`, 'warn');
          return 75; // EX_TEMPFAIL-like: caller can retry/requeue
        }
        lockRelease = lock.release;
        await this.logStream.appendLog(job.id, `Acquired deploy lock for ${env}`, 'info');
      }

      // Heartbeat while running
      heartbeatTimer = setInterval(() => {
        this.heartbeat.tick(job.id).catch(() => {});
      }, 10_000);

      await this.logStream.appendLog(job.id, `worker=${workerId} exec: ${job.command}`, 'info');

      const exitCode = await new Promise<number>((resolve) => {
        const child = spawn(job.command, {
          shell: true,
          env: process.env,
        });

        child.stdout?.on('data', (buf) => {
          this.logStream.appendLog(job.id, buf.toString('utf8'), 'info').catch(() => {});
        });
        child.stderr?.on('data', (buf) => {
          this.logStream.appendLog(job.id, buf.toString('utf8'), 'error').catch(() => {});
        });

        child.on('close', (code) => resolve(code ?? 1));
        child.on('error', () => resolve(1));
      });

      return exitCode;
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (lockRelease) await lockRelease();
    }
  }
}
