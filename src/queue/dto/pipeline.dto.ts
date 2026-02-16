/**
 * Pipeline config
 * Stages, steps, and optional env vars per stage.
 */
export interface PipelineConfig {
  stages: PipelineStage[];
  env?: Record<string, string>;
}

export interface PipelineStage {
  name: string;
  steps: PipelineStep[];
  env?: Record<string, string>;
}

export interface PipelineStep {
  name: string;
  command: string;
  priority?: number;
}
