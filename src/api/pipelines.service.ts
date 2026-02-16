import { DataSource } from 'typeorm';

export class PipelinesService {
  constructor(private readonly dataSource: DataSource) {}

  async findPipeline(repo: string) {
    return this.dataSource
      .query(`SELECT * FROM pipelines WHERE repository = $1 LIMIT 1`, [repo])
      .then((r) => r[0]);
  }

  async createPipelineRun(pipelineId: string, payload: unknown) {
    const result = await this.dataSource.query(
      `
      INSERT INTO pipeline_runs (pipeline_id, status, trigger_payload)
      VALUES ($1, 'pending', $2)
      RETURNING *
      `,
      [pipelineId, payload],
    );

    return result[0];
  }
}
