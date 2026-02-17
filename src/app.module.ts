import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { LocksModule } from './locks/locks.module';
import { PipelinesModule } from './api/pipelines/pipelines.module';
import { RunsModule } from './api/runs/runs.module';
import { WebhooksModule } from './api/webhooks/webhooks.module';
import { StreamingModule } from './streaming/streaming.module';
import { WorkerModule } from './worker/worker.module';
import { DashboardModule } from './api/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    LocksModule,
    PipelinesModule,
    RunsModule,
    WebhooksModule,
    StreamingModule,
    WorkerModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
