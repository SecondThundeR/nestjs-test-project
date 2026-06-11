import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '@app/config';
import { OrderEntity } from './entities/order.entity';
import { ordersMigrations } from './migrations';

loadEnv();

export default new DataSource(
  buildDataSourceOptions('ORDERS', [OrderEntity], ordersMigrations),
);
