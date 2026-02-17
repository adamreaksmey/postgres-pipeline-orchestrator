import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JobQueueService } from 'src/queue/job-queue.service';

const DEFAULT_TIMEOUT_SECONDS = 30;
const DEFAULT_RECLAIM_INTERVAL_MS = 15_000;

/**
 * Heartbeat: workers call tick(jobId) while running a job; reclaim loop puts stuck jobs back to pending.
 */
@Injectable()
export class HeartbeatService implements OnModuleInit, OnModuleDestroy {
  private reclaimTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly jobQueue: JobQueueService) {}

  async onModuleInit(): Promise<void> {
    this.startReclaimLoop(DEFAULT_RECLAIM_INTERVAL_MS, DEFAULT_TIMEOUT_SECONDS);
  }

  onModuleDestroy(): void {
    this.stopReclaimLoop();
  }

  /**
   * Call periodically (e.g. every 10s) while the worker is executing a job.
   * Keeps heartbeat_at fresh so the job is not reclaimed as stuck.
   */
  async tick(jobId: string): Promise<void> {
    await this.jobQueue.updateHeartbeat(jobId);
  }

  /**
   * Run dead-worker reclaim once: jobs with heartbeat older than timeoutSeconds become pending again.
   */
  async runReclaimOnce(timeoutSeconds = DEFAULT_TIMEOUT_SECONDS): Promise<void> {
    await this.jobQueue.reclaimStuckJobs(timeoutSeconds);
  }

  /**
   * Start a loop that reclaims stuck jobs every intervalMs. Uses timeoutSeconds to decide "stuck".
   */
  startReclaimLoop(
    intervalMs = DEFAULT_RECLAIM_INTERVAL_MS,
    timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
  ): void {
    this.stopReclaimLoop();
    this.reclaimTimer = setInterval(() => {
      this.runReclaimOnce(timeoutSeconds).catch(() => {
        // ignore; next interval will retry
      });
    }, intervalMs);
  }

  stopReclaimLoop(): void {
    if (this.reclaimTimer) {
      clearInterval(this.reclaimTimer);
      this.reclaimTimer = null;
    }
  }
}
