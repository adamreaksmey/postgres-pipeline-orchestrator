import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JobClaimerService } from './job-claimer.service';
import { JobExecutorService } from './job-executor.service';
import { JobQueueService } from 'src/queue/job-queue.service';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Worker main loop:
 * - claim next pending job
 * - execute it (streams logs, deploy lock guard, heartbeats)
 * - mark completed/failed (with retry policy in DB)
 */
@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private abort = new AbortController();
  private loopPromise: Promise<void> | null = null;

  private readonly workerId =
    process.env.WORKER_ID || process.env.HOSTNAME || `worker-${randomUUID().slice(0, 8)}`;

  constructor(
    private readonly claimer: JobClaimerService,
    private readonly executor: JobExecutorService,
    private readonly jobQueue: JobQueueService,
  ) {}

  onModuleInit(): void {
    // Don't run the worker loop in the API container.
    // Set RUN_WORKER_LOOP=true in worker containers.
    if (process.env.RUN_WORKER_LOOP !== 'true') return;
    this.loopPromise = this.runLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.abort.abort();
    if (this.loopPromise) {
      await Promise.race([this.loopPromise, sleep(2000)]);
    }
  }

  private async runLoop(): Promise<void> {
    while (!this.abort.signal.aborted) {
      try {
        const job = await this.claimer.claimNextOrWait(this.workerId, {
          pollMs: 1000,
          signal: this.abort.signal,
        });

        let exitCode = 1;
        try {
          exitCode = await this.executor.execute(job, this.workerId);
        } catch {
          exitCode = 1;
        }

        if (exitCode === 0) {
          await this.jobQueue.markCompleted(job.id, exitCode);
        } else {
          await this.jobQueue.markFailed(job.id, exitCode);
        }
      } catch {
        if (this.abort.signal.aborted) return;
        await sleep(1000);
      }
    }
  }
}
