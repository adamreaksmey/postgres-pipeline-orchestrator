import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { Job } from 'src/database/entities/job.entity';
import { DeploymentLockService } from 'src/locks/deployment-lock.service';
import { HeartbeatService } from './heartbeat.service';
import { LogStreamService } from 'src/streaming/log-stream.service';

// I want to clarify that is simply a mock
// and we wont actually be running actual deployment scripts

function createLineBuffer(onLine: (line: string) => void) {
  let buffer = '';

  return {
    write(chunk: string) {
      buffer += chunk;

      // Split into complete lines; keep the last partial line in buffer.
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        onLine(part);
      }
    },
    flush() {
      const remaining = buffer;
      buffer = '';
      if (remaining.length > 0) onLine(remaining);
    },
  };
}

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
 * Deploy jobs are guarded by PostgreSQL advisory locks, see @DeploymentLockService for more details
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
    const jobId = job?.id ?? (job as unknown as Record<string, unknown>)?.id;
    const command = String(
      job?.command ?? (job as unknown as Record<string, unknown>)?.command ?? '',
    );
    if (!jobId) {
      return 1;
    }

    const runId =
      job?.pipeline_run_id ?? (job as unknown as Record<string, unknown>)?.pipeline_run_id;

    let lockRelease: (() => Promise<void>) | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    try {
      if (job.stage === 'deploy') {
        const env = guessDeployEnvironment(job);
        const lock = await this.locks.tryAcquire(env, runId != null ? String(runId) : undefined);
        if (!lock.acquired) {
          await this.logStream.appendLog(
            String(jobId),
            `Deploy lock busy for ${env}; skipping`,
            'warn',
          );
          return 75; // EX_TEMPFAIL-like: caller can retry/requeue
        }
        lockRelease = lock.release;
        await this.logStream.appendLog(String(jobId), `Acquired deploy lock for ${env}`, 'info');
      }

      // Heartbeat while running
      heartbeatTimer = setInterval(() => {
        this.heartbeat.tick(String(jobId)).catch(() => {});
      }, 10_000);

      await this.logStream.appendLog(String(jobId), `worker=${workerId} exec: ${command}`, 'info');

      const exitCode = await new Promise<number>((resolve) => {
        const child = spawn(command, {
          shell: true,
          env: process.env,
        });

        const stdoutBuffer = createLineBuffer((line) => {
          this.logStream.appendLog(String(jobId), line, 'info').catch(() => {});
        });
        const stderrBuffer = createLineBuffer((line) => {
          this.logStream.appendLog(String(jobId), line, 'error').catch(() => {});
        });

        if (child.stdout)
          child.stdout.on('data', (buf) => stdoutBuffer.write(buf.toString('utf8')));
        if (child.stderr)
          child.stderr.on('data', (buf) => stderrBuffer.write(buf.toString('utf8')));

        child.on('close', (code) => {
          // Flush any partial line that didn't end in \n
          stdoutBuffer.flush();
          stderrBuffer.flush();
          resolve(code ?? 1);
        });
        child.on('error', (err) => {
          stdoutBuffer.flush();
          stderrBuffer.flush();
          this.logStream
            .appendLog(String(jobId), `Execution error: ${err.message}`, 'error')
            .catch(() => {});
          resolve(1);
        });
      });

      return exitCode;
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (lockRelease) await lockRelease();
    }
  }
}
