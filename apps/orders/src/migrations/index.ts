import type { DataSourceOptions } from 'typeorm';
import { InitOrders1781193213309 } from './1781193213309-InitOrders';

export const ordersMigrations: NonNullable<DataSourceOptions['migrations']> = [
  InitOrders1781193213309,
];
