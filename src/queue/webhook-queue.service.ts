import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JobQueueService } from './job-queue.service';
import { PipelinesService } from 'src/api/pipelines/pipelines.service';
import { WebhookOutbox } from 'src/database/entities/webhook-outbox.entity';
import type { GitWebhookPayload, PipelineConfig } from './dto';

/** One claimed webhook notification to send (from webhooks_outbox). */
export interface WebhookOutboxItem {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  webhook_url: string;
  retry_count: number;
  max_retries: number;
}

/**
 * 1) Handles incoming Git push webhooks → create pipeline run, enqueue jobs.
 * 2) Webhook outbox: enqueue notifications (e.g. pipeline.completed, job.failed)
 *    and process them (POST to webhook_url, retries with exponential backoff).
 */
@Injectable()
export class WebhookQueueService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jobQueue: JobQueueService,
    private readonly pipelinesService: PipelinesService,
  ) {}

  // --- Git push handler (workflow steps 2–4) ---

  /**
   * Handle Git push: resolve pipeline, create run, enqueue jobs from config.
   * @throws if no pipeline found for payload.repo
   */
  async handleGitPush(payload: GitWebhookPayload): Promise<{ runId: string }> {
    const pipeline = await this.pipelinesService.findByRepository(payload.repo);
    if (!pipeline) {
      throw new Error(`No pipeline found for repo: ${payload.repo}`);
    }

    const run = await this.pipelinesService.createPipelineRun(
      pipeline.id,
      'git_push',
      payload as Record<string, unknown>,
    );
    const config = pipeline.config as unknown as PipelineConfig;
    if (!config?.stages?.length) {
      return { runId: run.id };
    }

    await this.enqueueJobsFromPipeline(run.id, config);
    return { runId: run.id };
  }

  private async enqueueJobsFromPipeline(runId: string, config: PipelineConfig): Promise<void> {
    for (const stage of config.stages) {
      for (const step of stage.steps) {
        await this.jobQueue.insertNewJob(
          runId,
          stage.name,
          step.name,
          step.command,
          step.priority ?? 5,
        );
      }
    }
  }

  // --- Webhook outbox ---

  /**
   * Enqueue a notification to send later (e.g. pipeline.completed, job.failed).
   * A worker should call processOneWebhook() in a loop to send these.
   */
  async enqueueNotification(
    eventType: string,
    payload: Record<string, unknown>,
    webhookUrl: string,
    maxRetries = 5,
  ): Promise<WebhookOutbox> {
    const row = this.dataSource.manager.create(WebhookOutbox, {
      event_type: eventType,
      payload,
      webhook_url: webhookUrl,
      status: 'pending',
      retry_count: 0,
      max_retries: maxRetries,
      next_retry_at: new Date(),
    });
    return this.dataSource.manager.save(row);
  }

  /**
   * Claim the next due webhook (pending, next_retry_at <= now). Sets status to 'processing'.
   * Returns null if none available.
   */
  async claimNextWebhook(): Promise<WebhookOutboxItem | null> {
    const result = await this.dataSource.query(
      `
      UPDATE webhooks_outbox
      SET status = 'processing'
      WHERE id = (
        SELECT id FROM webhooks_outbox
        WHERE status = 'pending' AND next_retry_at <= NOW()
        ORDER BY next_retry_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, event_type, payload, webhook_url, retry_count, max_retries
      `,
    );
    const row = result[0] ?? null;
    return row ? this.mapRowToOutboxItem(row) : null;
  }

  /** Mark webhook as successfully sent. */
  async markWebhookProcessed(id: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE webhooks_outbox SET status = 'processed', processed_at = NOW() WHERE id = $1`,
      [id],
    );
  }

  /**
   * Mark webhook as failed. Increments retry_count and sets next_retry_at (exponential backoff).
   * If retry_count >= max_retries, sets status to 'failed'.
   */
  async markWebhookFailed(id: string): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE webhooks_outbox
      SET status = CASE WHEN retry_count + 1 >= max_retries THEN 'failed' ELSE 'pending' END,
          retry_count = retry_count + 1,
          next_retry_at = CASE
            WHEN retry_count + 1 >= max_retries THEN next_retry_at
            ELSE NOW() + (power(2, retry_count + 1) || ' seconds')::interval
          END
      WHERE id = $1
      `,
      [id],
    );
  }

  /**
   * Process one webhook: claim, POST to webhook_url, mark processed or failed.
   * Call this in a worker loop to drain the outbox (Slack/Discord notifications).
   */
  async processOneWebhook(): Promise<boolean> {
    const item = await this.claimNextWebhook();
    if (!item) return false;

    try {
      const res = await fetch(item.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: item.event_type,
          ...item.payload,
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      await this.markWebhookProcessed(item.id);
      return true;
    } catch {
      await this.markWebhookFailed(item.id);
      return true; // we processed the row (attempted send)
    }
  }

  private mapRowToOutboxItem(row: Record<string, unknown>): WebhookOutboxItem {
    return {
      id: row.id as string,
      event_type: row.event_type as string,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      webhook_url: row.webhook_url as string,
      retry_count: Number(row.retry_count),
      max_retries: Number(row.max_retries),
    };
  }
}
