import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { PipelineRun } from './pipeline-run.entity';

@Entity('deployment_locks')
@Index(['expires_at'])
export class DeploymentLock {
  @PrimaryColumn({ length: 100 })
  environment: string;

  @Column({ type: 'uuid', nullable: true })
  locked_by: string | null;

  @ManyToOne(() => PipelineRun, (run) => run.locks)
  @JoinColumn({ name: 'locked_by' })
  locked_by_run: PipelineRun | null;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  locked_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expires_at: Date | null;
}
