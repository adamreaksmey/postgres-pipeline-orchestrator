import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePipelineDto {
  @ApiPropertyOptional({ example: 'frontend-app' })
  name?: string;

  @ApiPropertyOptional({ example: 'example/frontend-app' })
  repository?: string;

  @ApiPropertyOptional({
    description: 'Pipeline config JSON (stages/steps). Stored in pipelines.config (jsonb).',
  })
  config?: Record<string, unknown>;
}
