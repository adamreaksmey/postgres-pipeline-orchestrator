import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

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
 * Webhook outbox processor: enqueue notifications and process the queue.
 * Workers call processOneWebhook() in a loop to POST to webhook_url (Slack/Discord etc.)
 * with retries and exponential backoff.
 */
@Injectable()
export class WebhookQueueService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Enqueue a notification to send later (e.g. pipeline.completed, job.failed).
   */
  async enqueueNotification(
    eventType: string,
    payload: Record<string, unknown>,
    webhookUrl: string,
    maxRetries = 5,
  ) {
    const result = await this.dataSource.query(
      `INSERT INTO webhooks_outbox (event_type, payload, webhook_url, status, retry_count, max_retries, next_retry_at)
       VALUES ($1, $2::jsonb, $3, 'pending', 0, $4, NOW())
       RETURNING *`,
      [eventType, JSON.stringify(payload), webhookUrl, maxRetries],
    );
    return result[0];
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
   * Call in a worker loop to drain the outbox.
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
      return true;
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
