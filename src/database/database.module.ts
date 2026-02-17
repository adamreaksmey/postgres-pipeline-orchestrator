import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pipeline, PipelineRun, Job, JobLog, DeploymentLock, WebhookOutbox } from './entities';
import { DatabaseSeedService } from './database-seed.service';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        entities: [Pipeline, PipelineRun, Job, JobLog, DeploymentLock, WebhookOutbox],
        // Only one process should synchronize the database (see SYNC_DATABASE in docker compose)
        synchronize: config.get('SYNC_DATABASE') !== 'false',
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [DatabaseSeedService],
})
export class DatabaseModule {}
