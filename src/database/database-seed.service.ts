import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Pipeline } from './entities/pipeline.entity';
import { PIPELINE_SEED } from './seed/pipeline.seed';

const PIPELINE_STATS_MATVIEW_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = 'pipeline_stats'
  ) THEN
    EXECUTE $mv$
      CREATE MATERIALIZED VIEW pipeline_stats AS
      SELECT
        p.id AS pipeline_id,
        p.name,
        COUNT(pr.id) AS total_runs,
        COUNT(*) FILTER (WHERE pr.status = 'success') AS success_count,
        COUNT(*) FILTER (WHERE pr.status = 'failed') AS failure_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (pr.completed_at - pr.started_at)))
          FILTER (WHERE pr.started_at IS NOT NULL AND pr.completed_at IS NOT NULL)
        ) AS avg_duration_seconds,
        MAX(pr.created_at) AS last_run_at
      FROM pipelines p
      LEFT JOIN pipeline_runs pr ON pr.pipeline_id = p.id
      WHERE pr.created_at > NOW() - INTERVAL '30 days' OR pr.id IS NULL
      GROUP BY p.id, p.name
    $mv$;

    -- Needed for REFRESH MATERIALIZED VIEW CONCURRENTLY
    EXECUTE 'CREATE UNIQUE INDEX pipeline_stats_pipeline_id_idx ON pipeline_stats(pipeline_id)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION refresh_pipeline_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY pipeline_stats;
END;
$$ LANGUAGE plpgsql;
`;

/**
 * Runs seed data on app startup. Inserts fake pipelines only if the pipelines table is empty.
 */
@Injectable()
export class DatabaseSeedService implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.seedPipelinesIfEmpty();
    await this.ensurePipelineStatsMatView();
  }

  private async seedPipelinesIfEmpty(): Promise<void> {
    const repo = this.dataSource.getRepository(Pipeline);
    const count = await repo.count();
    if (count > 0) return;

    for (const row of PIPELINE_SEED) {
      const pipeline = repo.create(row);
      await repo.save(pipeline);
    }
  }

  /**
   * Materialized view for dashboard stats (Postgres replaces Redis cache).
   * Only run this in the API process (SYNC_DATABASE=true) to avoid multi-process DDL races.
   */
  private async ensurePipelineStatsMatView(): Promise<void> {
    if (process.env.SYNC_DATABASE === 'false') return;
    await this.dataSource.query(PIPELINE_STATS_MATVIEW_SQL);
  }
}
