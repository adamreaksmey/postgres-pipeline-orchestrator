import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PipelineRun } from 'src/database/entities/pipeline-run.entity';
import { Job } from 'src/database/entities/job.entity';
import { JobLog } from 'src/database/entities/job-log.entity';
import { PipelinesService } from 'src/api/pipelines/pipelines.service';
import { JobQueueService } from 'src/queue/job-queue.service';
import type { PipelineConfig } from 'src/queue/dto';

/**
 * trigger pipeline runs, get run status, and get job logs.
 */
@Injectable()
export class RunsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly pipelinesService: PipelinesService,
    private readonly jobQueue: JobQueueService,
  ) {}

  async findAll(pipelineId?: string): Promise<PipelineRun[]> {
    const repo = this.dataSource.getRepository(PipelineRun);
    return repo.find({
      where: pipelineId ? { pipeline_id: pipelineId } : undefined,
      order: { created_at: 'DESC' },
      take: 100,
    });
  }

  // Get one run by id
  async findOne(runId: string): Promise<PipelineRun | null> {
    return this.dataSource.getRepository(PipelineRun).findOne({
      where: { id: runId },
    });
  }

  // Get run with its jobs (for status view)
  async findOneWithJobs(runId: string): Promise<{ run: PipelineRun; jobs: Job[] } | null> {
    const run = await this.dataSource.getRepository(PipelineRun).findOne({
      where: { id: runId },
      relations: ['jobs'],
    });
    if (!run) return null;
    const jobs = run.jobs ?? [];
    return { run, jobs };
  }

  // Get log lines for a job (for logs view)
  async getJobLogs(jobId: string): Promise<JobLog[]> {
    return this.dataSource.getRepository(JobLog).find({
      where: { job_id: jobId },
      order: { timestamp: 'ASC' },
    });
  }

  // Manually trigger a pipeline run: create run, enqueue jobs from pipeline config.
  async triggerRun(
    pipelineId: string,
    triggerType = 'manual',
    triggerMetadata: Record<string, unknown> | null = null,
  ): Promise<PipelineRun> {
    const pipeline = await this.pipelinesService.findOne(pipelineId);
    if (!pipeline) throw new Error('Pipeline not found');

    const runRow = await this.pipelinesService.createPipelineRun(
      pipelineId,
      triggerType,
      triggerMetadata,
    );
    const run = await this.dataSource.getRepository(PipelineRun).findOne({
      where: { id: runRow.id },
    });
    if (!run) throw new Error('Run not created');

    const config = pipeline.config as unknown as PipelineConfig | undefined;
    if (config?.stages?.length) {
      const inserts: Promise<unknown>[] = [];
      config.stages.forEach((stage, stageIndex) => {
        stage.steps.forEach((step, stepIndex) => {
          inserts.push(
            this.jobQueue.insertNewJob(
              run.id,
              stage.name,
              step.name,
              step.command,
              step.priority ?? 5,
              stageIndex,
              stepIndex,
            ),
          );
        });
      });
      await Promise.all(inserts);
    }

    return run;
  }
}
