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
    stageOrder = 0,
    stepOrder = 0,
  ) {
    const result = await this.dataSource.query(
      `INSERT INTO jobs (
         pipeline_run_id, stage, step_name, command, status, priority,
         stage_order, step_order, retry_count, max_retries
       ) VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, 0, 3)
       RETURNING *`,
      [pipelineRunId, stage, stepName, command, priority, stageOrder, stepOrder],
    );
    return result[0];
  }

  /**
   * Claims the next claimable job: pending and "unlocked" (all earlier jobs in the same run
   * by stage_order, step_order are terminal). Stage gating and step order enforced in Postgres.
   */
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
        SELECT j.id
        FROM jobs j
        WHERE j.status = 'pending'
          AND NOT EXISTS (
            SELECT 1 FROM jobs prev
            WHERE prev.pipeline_run_id = j.pipeline_run_id
              AND (prev.stage_order, prev.step_order) < (j.stage_order, j.step_order)
              AND prev.status NOT IN ('success', 'failed', 'cancelled')
          )
        ORDER BY j.stage_order, j.step_order, j.priority DESC, j.created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *;
      `,
      [workerId],
    );

    const row = result[0] ?? null;
    if (!row) return null;
    return this.normalizeJobRow(row) as unknown as Job;
  }

  /** Raw pg row may have different key casing; ensure id/command exist for executor and appendLog. */
  private normalizeJobRow(row: Record<string, unknown>): Record<string, unknown> {
    return {
      ...row,
      id: row.id ?? row.Id,
      command: row.command ?? row.Command ?? '',
      stage: row.stage ?? row.Stage ?? '',
    };
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
