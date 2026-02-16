import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('webhooks_outbox')
@Index(['status', 'next_retry_at'])
export class WebhookOutbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  event_type: string;

  @Column('jsonb')
  payload: Record<string, unknown>;

  @Column('text')
  webhook_url: string;

  @Column({ length: 50, default: 'pending' })
  status: string;

  @Column({ default: 0 })
  retry_count: number;

  @Column({ default: 5 })
  max_retries: number;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  next_retry_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processed_at: Date | null;
}
