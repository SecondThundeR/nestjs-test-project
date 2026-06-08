import { type Product } from '@app/domains';
import { isoTransformer, numericTransformer } from '@app/config';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('products')
export class ProductEntity implements Product {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column()
  name!: string;

  @Column({ default: '' })
  description!: string;

  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  price!: number;

  @Column('int', { default: 0 })
  stock!: number;

  @CreateDateColumn({ type: 'timestamptz', transformer: isoTransformer })
  createdAt!: string;

  @UpdateDateColumn({ type: 'timestamptz', transformer: isoTransformer })
  updatedAt!: string;
}
