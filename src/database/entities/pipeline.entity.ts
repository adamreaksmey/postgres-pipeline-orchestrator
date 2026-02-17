import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { PipelineRun } from './pipeline-run.entity';

/**
 * Pipeline definition: one CI/CD pipeline per repo.
 * Stores name, repository URL (for webhook matching), and config (stages, steps, env) as json.
 */
@Entity('pipelines')
export class Pipeline {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 500 })
  repository: string;

  @Column('jsonb')
  config: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => PipelineRun, (run) => run.pipeline)
  runs: PipelineRun[];
}
