import { DataSource } from 'typeorm';

export class PipelinesService {
  constructor(private readonly dataSource: DataSource) {}

  async findPipeline(repo: string) {
    return this.dataSource
      .query(`SELECT * FROM pipelines WHERE repository = $1 LIMIT 1`, [repo])
      .then((r) => r[0]);
  }

  async createPipelineRun(
    pipelineId: string,
    triggerType: string,
    triggerMetadata: Record<string, unknown> | null,
  ) {
    const result = await this.dataSource.query(
      `
      INSERT INTO pipeline_runs (pipeline_id, trigger_type, trigger_metadata, status)
      VALUES ($1, $2, $3, 'pending')
      RETURNING *
      `,
      [pipelineId, triggerType, triggerMetadata ?? {}],
    );
    return result[0];
  }
}
