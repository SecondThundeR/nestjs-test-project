import type { DataSourceOptions } from 'typeorm';

import { InitProducts1781193171715 } from './1781193171715-InitProducts.js';

import { AddStockReservations1793448000000 } from './1793448000000-AddStockReservations.js';

export const productsMigrations: NonNullable<DataSourceOptions['migrations']> =
  [InitProducts1781193171715, AddStockReservations1793448000000];
