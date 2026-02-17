import { ApiProperty } from '@nestjs/swagger';

export class CreatePipelineDto {
  @ApiProperty({ example: 'frontend-app' })
  name!: string;

  @ApiProperty({
    example: 'example/frontend-app',
    description: 'Must match what your git webhook sends',
  })
  repository!: string;

  @ApiProperty({
    description: 'Pipeline config JSON (stages/steps). Stored in pipelines.config (jsonb).',
    example: {
      stages: [
        { name: 'build', steps: [{ name: 'build', command: 'npm run build', priority: 5 }] },
      ],
    },
  })
  config!: Record<string, unknown>;
}
