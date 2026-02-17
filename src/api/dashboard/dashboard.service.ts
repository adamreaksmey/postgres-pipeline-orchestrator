import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface PipelineStatsRow {
  pipeline_id: string;
  name: string;
  total_runs: number;
  success_count: number;
  failure_count: number;
  avg_duration_seconds: number | null;
  last_run_at: string | null;
}

export interface DeploymentLockRow {
  environment: string;
  locked_by: string | null;
  locked_at: string;
  run_status?: string | null;
  pipeline_name?: string | null;
}

@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  async listPipelineStats(): Promise<PipelineStatsRow[]> {
    const rows = await this.dataSource.query(
      `SELECT * FROM pipeline_stats ORDER BY last_run_at DESC NULLS LAST, name ASC`,
    );
    return rows;
  }

  async refreshPipelineStats(): Promise<void> {
    try {
      await this.dataSource.query(`SELECT refresh_pipeline_stats()`);
    } catch {
      // Fallback if CONCURRENTLY fails (e.g. first run or lock contention)
      await this.dataSource.query(`REFRESH MATERIALIZED VIEW pipeline_stats`);
    }
  }

  /**
   * Current deployment locks (who holds which environment). Joins run + pipeline for dashboard display.
   */
  async listDeploymentLocks(): Promise<DeploymentLockRow[]> {
    const rows = await this.dataSource.query(
      `SELECT dl.environment, dl.locked_by, dl.locked_at,
              pr.status AS run_status, p.name AS pipeline_name
       FROM deployment_locks dl
       LEFT JOIN pipeline_runs pr ON pr.id = dl.locked_by
       LEFT JOIN pipelines p ON p.id = pr.pipeline_id
       ORDER BY dl.environment`,
    );
    return rows;
  }
}
