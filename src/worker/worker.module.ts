import { Module } from '@nestjs/common';
import { HeartbeatService } from './heartbeat.service';
import { JobQueueService } from 'src/queue/job-queue.service';
import { WebhookQueueService } from 'src/queue/webhook-queue.service';
import { JobExecutorService } from './job-executor.service';
import { JobClaimerService } from './job-claimer.service';
import { WorkerService } from './worker.service';
import { LocksModule } from 'src/locks/locks.module';
import { StreamingModule } from 'src/streaming/streaming.module';

@Module({
  imports: [LocksModule, StreamingModule],
  providers: [
    HeartbeatService,
    JobQueueService,
    WebhookQueueService,
    JobExecutorService,
    JobClaimerService,
    WorkerService,
  ],
  exports: [
    HeartbeatService,
    JobQueueService,
    WebhookQueueService,
    JobExecutorService,
    JobClaimerService,
    WorkerService,
  ],
})
export class WorkerModule {}
