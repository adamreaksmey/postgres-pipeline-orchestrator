import { DataSource } from 'typeorm';
import { JobQueueService } from './job-queue.service';
import { PipelinesService } from 'src/api/pipelines.service';
import type { GitWebhookPayload, PipelineConfig } from './dto';

export class WebhookQueueService {
  constructor(
    private dataSource: DataSource,
    private jobQueue: JobQueueService,
    private pipelinesService: PipelinesService,
  ) {}

  async handleGitPush(payload: GitWebhookPayload) {
    // 1. resolve pipeline
    const pipeline = await this.pipelinesService.findPipeline(payload.repo);

    // 2. create pipeline run
    const run = await this.pipelinesService.createPipelineRun(pipeline.id, payload);

    // 3. enqueue jobs from pipeline config
    await this.enqueueJobsFromPipeline(run.id, pipeline.config);
  }

  private async enqueueJobsFromPipeline(runId: string, config: PipelineConfig) {
    for (const stage of config.stages) {
      for (const step of stage.steps) {
        await this.jobQueue.insertNewJob(
          runId,
          stage.name,
          step.name,
          step.command,
          step.priority ?? 0,
        );
      }
    }
  }
}
