import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { PipelineRun } from './pipeline-run.entity';
import { JobLog } from './job-log.entity';

/**
 * Job queue (outbox): one runnable unit (stage + step + command) per row.
 * Workers claim via FOR UPDATE SKIP LOCKED; claimed_by/heartbeat_at support dead-worker reclaim.
 */
@Entity('jobs')
@Index(['status', 'priority', 'created_at'])
@Index(['heartbeat_at'])
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  pipeline_run_id: string;

  @ManyToOne(() => PipelineRun, (run) => run.jobs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pipeline_run_id' })
  pipeline_run: PipelineRun;

  @Column({ length: 100 })
  stage: string;

  @Column({ length: 255 })
  step_name: string;

  @Column('text')
  command: string;

  @Column({ length: 50, default: 'pending' })
  status: string;

  @Column({ default: 5 })
  priority: number;

  @Column({ length: 100, nullable: true })
  claimed_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  claimed_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  heartbeat_at: Date | null;

  @Column({ default: 0 })
  retry_count: number;

  @Column({ default: 3 })
  max_retries: number;

  @Column({ type: 'int', nullable: true })
  exit_code: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  started_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @OneToMany(() => JobLog, (log) => log.job)
  logs: JobLog[];
}
