import { Module } from '@nestjs/common';
import { HeartbeatService } from './heartbeat.service';
import { JobQueueService } from 'src/queue/job-queue.service';
import { JobExecutorService } from './job-executor.service';
import { JobClaimerService } from './job-claimer.service';
import { LocksModule } from 'src/locks/locks.module';
import { StreamingModule } from 'src/streaming/streaming.module';

@Module({
  imports: [LocksModule, StreamingModule],
  providers: [HeartbeatService, JobQueueService, JobExecutorService, JobClaimerService],
  exports: [HeartbeatService, JobQueueService, JobExecutorService, JobClaimerService],
})
export class WorkerModule {}
