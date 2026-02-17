import { Controller, Get, Post, Body, Param, Query, NotFoundException } from '@nestjs/common';
import { RunsService } from './runs.service';

@Controller('runs')
export class RunsController {
  constructor(private readonly runsService: RunsService) {}

  @Get()
  async findAll(@Query('pipelineId') pipelineId?: string) {
    return this.runsService.findAll(pipelineId);
  }

  // Logs for a job (must be before :id routes)
  @Get(':runId/jobs/:jobId/logs')
  async getJobLogs(@Param('runId') _runId: string, @Param('jobId') jobId: string) {
    return this.runsService.getJobLogs(jobId);
  }

  // Run with its jobs (status)
  @Get(':id/jobs')
  async findOneWithJobs(@Param('id') id: string) {
    const result = await this.runsService.findOneWithJobs(id);
    if (!result) throw new NotFoundException('Run not found');
    return result;
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const run = await this.runsService.findOne(id);
    if (!run) throw new NotFoundException('Run not found');
    return run;
  }

  // trigger a pipeline run
  @Post()
  async trigger(
    @Body()
    body: {
      pipelineId: string;
      triggerType?: string;
      trigger_metadata?: Record<string, unknown>;
    },
  ) {
    const run = await this.runsService.triggerRun(
      body.pipelineId,
      body.triggerType ?? 'manual',
      body.trigger_metadata ?? null,
    );
    return run;
  }
}
