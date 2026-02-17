import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';

const LOCK_PREFIX = 'deploy:';

/**
 * sticking with a raw pg client - no TypeORM.
 * keeps the code simple, avoids unnecessary abstraction,
 * and makes advisory locks predictable. For deployment locks,
 * I want as little overhead as possible.
 */

export interface AcquireResult {
  acquired: boolean;
  release: () => Promise<void>;
}

/**
 * Uses PostgreSQL advisory locks so only one deploy runs per environment at a time.
 * Lock is held on a dedicated connection; call release() when the deploy finishes
 * (or the lock is released when the connection closes, e.g. worker dies).
 */
@Injectable()
export class DeploymentLockService {
  private pool: Pool | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getPool(): Pool {
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: this.configService.getOrThrow<string>('DATABASE_URL'),
      });
    }
    return this.pool;
  }

  /**
   * Try to acquire the deploy lock for an environment (e.g. 'production', 'staging').
   * Non-blocking: returns immediately with acquired true/false.
   * When acquired, writes to deployment_locks for dashboard visibility; clears on release().
   *
   * If acquired, you must call result.release() when the deploy is done so the
   * connection is returned to the pool. If the process dies, the lock is released
   * automatically when the connection drops (deployment_locks row may stay until next acquire).
   */
  async tryAcquire(environment: string, pipelineRunId?: string | null): Promise<AcquireResult> {
    const key = LOCK_PREFIX + environment;
    const pool = this.getPool();
    const client: PoolClient = await pool.connect();

    try {
      const result = await client.query<{ acquired: boolean }>(
        `SELECT pg_try_advisory_lock(hashtext($1)) AS "acquired"`,
        [key],
      );
      const acquired = Boolean(result.rows[0]?.acquired);

      if (!acquired) {
        client.release();
        return { acquired: false, release: async () => {} };
      }

      if (pipelineRunId) {
        await client.query(
          `INSERT INTO deployment_locks (environment, locked_by, locked_at, expires_at)
           VALUES ($1, $2, NOW(), NULL)
           ON CONFLICT (environment) DO UPDATE SET
             locked_by = EXCLUDED.locked_by,
             locked_at = EXCLUDED.locked_at,
             expires_at = EXCLUDED.expires_at`,
          [environment, pipelineRunId],
        );
      }

      const release = async (): Promise<void> => {
        try {
          await client.query(`DELETE FROM deployment_locks WHERE environment = $1`, [environment]);
          await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [key]);
        } finally {
          client.release();
        }
      };

      return { acquired: true, release };
    } catch (err) {
      client.release();
      throw err;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
