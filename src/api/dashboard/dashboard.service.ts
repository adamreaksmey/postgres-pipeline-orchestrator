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
}
