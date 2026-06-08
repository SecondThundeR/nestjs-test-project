import {
  type Cart,
  type CartItem,
  isoTransformer,
  numericTransformer,
} from '@app/contracts';
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('carts')
export class CartEntity implements Cart {
  @PrimaryColumn()
  userId!: string;

  @Column({ type: 'jsonb', default: [] })
  items!: CartItem[];

  @Column('numeric', {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  total!: number;

  @UpdateDateColumn({ type: 'timestamptz', transformer: isoTransformer })
  updatedAt!: string;
}
