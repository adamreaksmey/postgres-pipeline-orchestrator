import { Module } from '@nestjs/common';
import { HeartbeatService } from './heartbeat.service';
import { JobQueueService } from 'src/queue/job-queue.service';

@Module({
  providers: [HeartbeatService, JobQueueService],
  exports: [HeartbeatService, JobQueueService],
})
export class WorkerModule {}
