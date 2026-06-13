import 'reflect-metadata';

import { buildDataSourceOptions } from '@app/config';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { cartMigrations } from './migrations';
import { CartSchema } from './schemas/cart.schema';

loadEnv();

export default new DataSource(
  buildDataSourceOptions('CART', [CartSchema], cartMigrations),
);
