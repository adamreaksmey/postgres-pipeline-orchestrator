import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Pipeline } from './entities/pipeline.entity';
import { PIPELINE_SEED } from './seed/pipeline.seed';

/**
 * Runs seed data on app startup. Inserts fake pipelines only if the pipelines table is empty.
 */
@Injectable()
export class DatabaseSeedService implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.seedPipelinesIfEmpty();
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
}
