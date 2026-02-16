import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Job } from './job.entity';

@Entity('job_logs')
@Index(['job_id', 'timestamp'])
export class JobLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'uuid' })
  job_id: string;

  @ManyToOne(() => Job, (job) => job.logs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: Job;

  @Column('text')
  log_line: string;

  @Column({ length: 20, default: 'info' })
  log_level: string;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  timestamp: Date;
}
