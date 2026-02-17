import { Module } from '@nestjs/common';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { PipelinesModule } from 'src/api/pipelines/pipelines.module';
import { JobQueueService } from 'src/queue/job-queue.service';

@Module({
  imports: [PipelinesModule],
  controllers: [RunsController],
  providers: [RunsService, JobQueueService],
})
export class RunsModule {}
