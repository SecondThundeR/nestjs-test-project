import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export type OrderOperationKind = 'capture' | 'refund' | 'release';

// One outstanding operation per order also fences conflicting commands.
@Entity('order_operations')
export class OrderOperationEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'varchar' })
  kind!: OrderOperationKind;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  nextAttemptAt!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
