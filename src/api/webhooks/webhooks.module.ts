import { Module } from '@nestjs/common';
import { GitWebhookController } from './git-webhook.controller';
import { PipelinesModule } from 'src/api/pipelines/pipelines.module';
import { RunsModule } from 'src/api/runs/runs.module';

@Module({
  imports: [PipelinesModule, RunsModule],
  controllers: [GitWebhookController],
})
export class WebhooksModule {}
