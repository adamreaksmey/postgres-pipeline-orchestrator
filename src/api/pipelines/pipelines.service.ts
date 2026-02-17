import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Pipeline } from 'src/database/entities/pipeline.entity';

@Injectable()
export class PipelinesService {
  constructor(private readonly dataSource: DataSource) {}

  private get repo() {
    return this.dataSource.getRepository(Pipeline);
  }

  async findAll(): Promise<Pipeline[]> {
    return this.repo.find({ order: { created_at: 'DESC' } });
  }

  async findOne(id: string): Promise<Pipeline | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByRepository(repo: string): Promise<Pipeline | null> {
    return this.repo.findOne({ where: { repository: repo } });
  }

  async create(dto: {
    name: string;
    repository: string;
    config: Record<string, unknown>;
  }): Promise<Pipeline> {
    const pipeline = this.repo.create(dto);
    return this.repo.save(pipeline);
  }

  async update(
    id: string,
    dto: Partial<{ name: string; repository: string; config: Record<string, unknown> }>,
  ): Promise<Pipeline> {
    const pipeline = await this.repo.findOne({ where: { id } });
    if (!pipeline) throw new Error('Pipeline not found');
    Object.assign(pipeline, dto);
    return this.repo.save(pipeline);
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (result.affected === 0) throw new Error('Pipeline not found');
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
