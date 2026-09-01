import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../../../libs/config/src/index.js';
import { cartMigrations } from './migrations/index.js';
import { CartSchema } from './schemas/cart.schema.js';

loadEnv();

export default new DataSource(
  buildDataSourceOptions('CART', [CartSchema], cartMigrations),
);
