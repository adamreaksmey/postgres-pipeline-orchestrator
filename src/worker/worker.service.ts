import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JobClaimerService } from './job-claimer.service';
import { JobExecutorService } from './job-executor.service';
import { JobQueueService } from 'src/queue/job-queue.service';
import { WebhookQueueService } from 'src/queue/webhook-queue.service';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Worker main loop:
 * - claim next pending job (or process webhook outbox when no job)
 * - execute job (streams logs, deploy lock guard, heartbeats), mark completed/failed
 * - when no job available, drain webhook outbox then sleep (RUN_WORKER_LOOP=true only)
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
    private readonly webhookQueue: WebhookQueueService,
  ) {}

  onModuleInit(): void {
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
    const pollMs = 1000;

    while (!this.abort.signal.aborted) {
      try {
        if (this.abort.signal.aborted) return;

        const job = await this.claimer.claimNext(this.workerId);

        if (job) {
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
          continue;
        }

        // No job: drain webhook outbox then wait
        let didWebhook = false;
        do {
          didWebhook = await this.webhookQueue.processOneWebhook();
        } while (didWebhook && !this.abort.signal.aborted);

        await sleep(pollMs);
      } catch {
        if (this.abort.signal.aborted) return;
        await sleep(pollMs);
      }
    }
  }
}
