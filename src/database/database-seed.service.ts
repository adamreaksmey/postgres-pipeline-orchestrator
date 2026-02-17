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

// Sync pipeline_runs.status/started_at/completed_at from jobs (DB is source of truth).
// Job statuses: pending, running, success, failed, cancelled. Run statuses: same.
const SYNC_PIPELINE_RUN_STATUS_TRIGGER_SQL = `
CREATE OR REPLACE FUNCTION sync_pipeline_run_status_from_jobs()
RETURNS TRIGGER AS $$
DECLARE
  run_id uuid := COALESCE(NEW.pipeline_run_id, OLD.pipeline_run_id);
  has_running boolean;
  all_terminal boolean;
  has_failed boolean;
BEGIN
  -- Any job running → run is running, set started_at if null
  SELECT EXISTS (
    SELECT 1 FROM jobs WHERE pipeline_run_id = run_id AND status = 'running'
  ) INTO has_running;

  IF has_running THEN
    UPDATE pipeline_runs
    SET status = 'running',
        started_at = COALESCE(started_at, NOW())
    WHERE id = run_id AND (status IS DISTINCT FROM 'running' OR started_at IS NULL);
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- All jobs terminal (success/failed/cancelled) → run is success or failed
  SELECT
    NOT EXISTS (SELECT 1 FROM jobs WHERE pipeline_run_id = run_id AND status NOT IN ('success', 'failed', 'cancelled')),
    EXISTS (SELECT 1 FROM jobs WHERE pipeline_run_id = run_id AND status = 'failed')
  INTO all_terminal, has_failed;

  IF all_terminal THEN
    UPDATE pipeline_runs
    SET status = CASE WHEN has_failed THEN 'failed' ELSE 'success' END,
        completed_at = COALESCE(completed_at, NOW())
    WHERE id = run_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jobs_sync_pipeline_run_status ON jobs;
CREATE TRIGGER jobs_sync_pipeline_run_status
  AFTER INSERT OR UPDATE OF status
  ON jobs
  FOR EACH ROW
  EXECUTE PROCEDURE sync_pipeline_run_status_from_jobs();
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
    await this.ensureSyncPipelineRunStatusTrigger();
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
   * Materialized view for dashboard stats.
   * Only run this in the API process (SYNC_DATABASE=true) to avoid multi-process DDL races.
   */
  private async ensurePipelineStatsMatView(): Promise<void> {
    const syncDbStatus = process?.env?.SYNC_DATABASE;
    if (!syncDbStatus || syncDbStatus === 'false') return;
    await this.dataSource.query(PIPELINE_STATS_MATVIEW_SQL);
  }

  /**
   * Trigger on jobs: when any job becomes running → run = running + started_at;
   * when all jobs terminal → run = success|failed + completed_at.
   */
  private async ensureSyncPipelineRunStatusTrigger(): Promise<void> {
    const syncDbStatus = process?.env?.SYNC_DATABASE;
    if (!syncDbStatus || syncDbStatus === 'false') return;
    await this.dataSource.query(SYNC_PIPELINE_RUN_STATUS_TRIGGER_SQL);
  }
}
