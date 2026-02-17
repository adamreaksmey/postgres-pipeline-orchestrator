import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TriggerRunDto {
  @ApiProperty({ description: 'Pipeline id to run' })
  pipelineId!: string;

  @ApiPropertyOptional({ description: "Trigger type (default: 'manual')", example: 'manual' })
  triggerType?: string;

  @ApiPropertyOptional({
    description: 'Arbitrary metadata stored as pipeline_runs.trigger_metadata (jsonb)',
    example: { branch: 'main', commit: 'abc123' },
  })
  trigger_metadata?: Record<string, unknown>;
}
