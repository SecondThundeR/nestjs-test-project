import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../../../libs/config/src/index.js';
import { StockIntentEntity } from './entities/stock-intent.entity.js';
import { OrderEntity } from './entities/order.entity.js';
import { ordersMigrations } from './migrations/index.js';

loadEnv();

export default new DataSource(
  buildDataSourceOptions(
    'ORDERS',
    [OrderEntity, StockIntentEntity],
    ordersMigrations,
  ),
);
