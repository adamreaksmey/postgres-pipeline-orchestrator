import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('pipeline-stats')
  @ApiOperation({ summary: 'Get pipeline stats (materialized view)' })
  async pipelineStats() {
    return this.dashboardService.listPipelineStats();
  }

  @Post('pipeline-stats/refresh')
  @ApiOperation({ summary: 'Refresh pipeline stats materialized view' })
  async refreshPipelineStats() {
    await this.dashboardService.refreshPipelineStats();
    return { ok: true };
  }
}
