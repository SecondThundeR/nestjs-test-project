import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('stock_intents')
export class StockIntentEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
