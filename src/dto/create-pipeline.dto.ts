export class CreatePipelineDto {
  name!: string;
  repository!: string;
  config!: Record<string, unknown>;
}
