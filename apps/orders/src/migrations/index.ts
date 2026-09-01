import type { DataSourceOptions } from 'typeorm';

import { InitOrders1781193213309 } from './1781193213309-InitOrders.js';
import { AddOrderPaymentId1781481600000 } from './1781481600000-AddOrderPaymentId.js';
import { AddOrderCaptureId1781568000000 } from './1781568000000-AddOrderCaptureId.js';

export const ordersMigrations: NonNullable<DataSourceOptions['migrations']> = [
  InitOrders1781193213309,
  AddOrderPaymentId1781481600000,
  AddOrderCaptureId1781568000000,
];
