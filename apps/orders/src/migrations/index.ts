import type { DataSourceOptions } from 'typeorm';
import { InitOrders1781193213309 } from './1781193213309-InitOrders';
import { AddOrderPaymentId1781481600000 } from './1781481600000-AddOrderPaymentId';
import { AddOrderCaptureId1781568000000 } from './1781568000000-AddOrderCaptureId';

export const ordersMigrations: NonNullable<DataSourceOptions['migrations']> = [
  InitOrders1781193213309,
  AddOrderPaymentId1781481600000,
  AddOrderCaptureId1781568000000,
];
