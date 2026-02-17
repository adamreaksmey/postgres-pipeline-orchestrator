import { Controller, Get, Post, Body, Param, Query, NotFoundException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RunsService } from './runs.service';
import { TriggerRunDto } from 'src/dto/trigger-run.dto';

@ApiTags('runs')
@Controller('runs')
export class RunsController {
  constructor(private readonly runsService: RunsService) {}

  @Get()
  @ApiOperation({ summary: 'List runs (optionally filtered by pipelineId)' })
  async findAll(@Query('pipelineId') pipelineId?: string) {
    return this.runsService.findAll(pipelineId);
  }

  // Logs for a job (must be before :id routes)
  @Get(':runId/jobs/:jobId/logs')
  @ApiOperation({ summary: 'Get log lines for a job' })
  async getJobLogs(@Param('runId') _runId: string, @Param('jobId') jobId: string) {
    return this.runsService.getJobLogs(jobId);
  }

  // Run with its jobs (status)
  @Get(':id/jobs')
  @ApiOperation({ summary: 'Get a run with its jobs (status view)' })
  async findOneWithJobs(@Param('id') id: string) {
    const result = await this.runsService.findOneWithJobs(id);
    if (!result) throw new NotFoundException('Run not found');
    return result;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one run' })
  async findOne(@Param('id') id: string) {
    const run = await this.runsService.findOne(id);
    if (!run) throw new NotFoundException('Run not found');
    return run;
  }

  // trigger a pipeline run
  @Post()
  @ApiOperation({ summary: 'Trigger a pipeline run (manual)' })
  async trigger(@Body() body: TriggerRunDto) {
    return this.runsService.triggerRun(
      body.pipelineId,
      body.triggerType ?? 'manual',
      body.trigger_metadata ?? null,
    );
  }
}
