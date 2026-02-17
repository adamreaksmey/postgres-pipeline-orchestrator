import { Module } from '@nestjs/common';
import { HeartbeatService } from './heartbeat.service';
import { JobQueueService } from 'src/queue/job-queue.service';
import { JobExecutorService } from './job-executor.service';
import { LocksModule } from 'src/locks/locks.module';
import { StreamingModule } from 'src/streaming/streaming.module';

@Module({
  imports: [LocksModule, StreamingModule],
  providers: [HeartbeatService, JobQueueService, JobExecutorService],
  exports: [HeartbeatService, JobQueueService, JobExecutorService],
})
export class WorkerModule {}
