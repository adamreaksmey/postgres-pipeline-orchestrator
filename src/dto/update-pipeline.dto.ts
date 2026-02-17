export class UpdatePipelineDto {
  name?: string;
  repository?: string;
  config?: Record<string, unknown>;
}
