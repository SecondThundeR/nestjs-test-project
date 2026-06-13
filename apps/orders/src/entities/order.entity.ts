import { isoTransformer, numericTransformer } from '@app/config';
import { type Order, type OrderItem, OrderStatus } from '@app/domains';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('orders')
export class OrderEntity implements Order {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column()
  userId!: string;

  @Column({ type: 'jsonb', default: [] })
  items!: OrderItem[];

  @Column('numeric', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  total!: number;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status!: OrderStatus;

  @Column()
  shippingAddress!: string;

  @Column({ type: 'varchar', nullable: true })
  paymentId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  captureId!: string | null;

  @CreateDateColumn({ type: 'timestamptz', transformer: isoTransformer })
  createdAt!: string;

  @UpdateDateColumn({ type: 'timestamptz', transformer: isoTransformer })
  updatedAt!: string;
}
