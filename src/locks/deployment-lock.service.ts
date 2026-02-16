import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

const LOCK_PREFIX = 'deploy:';

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
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Try to acquire the deploy lock for an environment (e.g. 'production', 'staging').
   * Non-blocking: returns immediately with acquired true/false.
   *
   * If acquired, you must call result.release() when the deploy is done so the
   * connection is returned to the pool. If the process dies, the lock is released
   * automatically when the connection drops.
   */
  async tryAcquire(environment: string): Promise<AcquireResult> {
    const key = LOCK_PREFIX + environment;
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();

    const result = await runner.query(
      `SELECT pg_try_advisory_lock(hashtext($1)) AS "pg_try_advisory_lock"`,
      [key],
    );
    const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
    const acquired = Boolean(
      rows[0] && typeof (rows[0] as any).pg_try_advisory_lock === 'boolean'
        ? (rows[0] as any).pg_try_advisory_lock
        : false,
    );

    if (!acquired) {
      await runner.release();
      return { acquired: false, release: async () => {} };
    }

    const release = async (): Promise<void> => {
      try {
        await runner.query(`SELECT pg_advisory_unlock(hashtext($1))`, [key]);
      } finally {
        await runner.release();
      }
    };

    return { acquired: true, release };
  }
}
