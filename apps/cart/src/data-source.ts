import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '@app/config';
import { CartSchema } from './schemas/cart.schema';
import { cartMigrations } from './migrations';

loadEnv();

export default new DataSource(
  buildDataSourceOptions('CART', [CartSchema], cartMigrations),
);
