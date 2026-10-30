import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { ReserveStockDto } from '../../../../libs/domains/src/index.js';

@Entity('stock_reservations')
export class StockReservationEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'jsonb' })
  items!: ReserveStockDto['items'];

  @Column({ type: 'varchar' })
  status!: 'pending' | 'reserved' | 'released';
}
