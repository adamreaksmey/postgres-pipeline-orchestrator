import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Pipeline } from './pipeline.entity';
import { Job } from './job.entity';
import { DeploymentLock } from './deployment-lock.entity';

/**
 * One execution of a pipeline (e.g. triggered by git push, manual, or scheduled).
 * Holds trigger_type, trigger_metadata (commit, branch, author), and run status/timestamps.
 */
@Entity('pipeline_runs')
export class PipelineRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  pipeline_id: string;

  @ManyToOne(() => Pipeline, (p) => p.runs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pipeline_id' })
  pipeline: Pipeline;

  @Column({ length: 50 })
  trigger_type: string;

  @Column('jsonb', { nullable: true })
  trigger_metadata: Record<string, unknown> | null;

  @Column({ length: 50, default: 'pending' })
  status: string;

  @Column({ type: 'timestamptz', nullable: true })
  started_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @OneToMany(() => Job, (job) => job.pipeline_run)
  jobs: Job[];

  @OneToMany(() => DeploymentLock, (lock) => lock.locked_by_run)
  locks: DeploymentLock[];
}
