import { Job } from 'src/database/entities/job.entity';
import { DataSource } from 'typeorm';

export class JobQueueService {
  constructor(private dataSource: DataSource) {}

  async insertNewJob(
    pipelineRunId: string,
    stage: string,
    stepName: string,
    command: string,
    priority: number,
  ) {
    const job = this.dataSource.manager.create(Job, {
      pipeline_run_id: pipelineRunId,
      stage,
      step_name: stepName,
      command,
      status: 'pending',
      priority,
      retry_count: 0,
      max_retries: 3,
      created_at: new Date(),
    });

    return this.dataSource.manager.save(job);
  }
}
