import type { DataSourceOptions } from 'typeorm';
import { InitOrders1781193213309 } from './1781193213309-InitOrders';
import { AddOrderPaymentId1781481600000 } from './1781481600000-AddOrderPaymentId';

export const ordersMigrations: NonNullable<DataSourceOptions['migrations']> = [
  InitOrders1781193213309,
  AddOrderPaymentId1781481600000,
];
