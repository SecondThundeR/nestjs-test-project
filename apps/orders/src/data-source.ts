import 'reflect-metadata';

import { buildDataSourceOptions } from '@app/config';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { OrderEntity } from './entities/order.entity';
import { ordersMigrations } from './migrations';

loadEnv();

export default new DataSource(
  buildDataSourceOptions('ORDERS', [OrderEntity], ordersMigrations),
);
