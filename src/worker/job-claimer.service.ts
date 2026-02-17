import { Injectable } from '@nestjs/common';
import { Job } from 'src/database/entities/job.entity';
import { JobQueueService } from 'src/queue/job-queue.service';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Claims jobs from queues in postgres. see @JobQueueService for more details
 * This is a thin wrapper around JobQueueService.claimNextJob() so the worker loop
 * can have a clean \"claimer\" abstraction.
 */
@Injectable()
export class JobClaimerService {
  constructor(private readonly jobQueue: JobQueueService) {}

  /** returns a job or null if none pending. */
  async claimNext(workerId: string): Promise<Job | null> {
    return this.jobQueue.claimNextJob(workerId);
  }

  /**
   * Polling helper: waits until a job is available (or until signal aborts).
   * Useful for a simple worker loop before we add LISTEN/NOTIFY wakeups.
   */
  async claimNextOrWait(
    workerId: string,
    options?: { pollMs?: number; signal?: AbortSignal },
  ): Promise<Job> {
    const pollMs = options?.pollMs ?? 1000;
    while (true) {
      if (options?.signal?.aborted) throw new Error('claimNextOrWait aborted');
      const job = await this.claimNext(workerId);
      if (job) return job;
      await sleep(pollMs);
    }
  }
}
