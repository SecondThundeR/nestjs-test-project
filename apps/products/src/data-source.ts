import 'reflect-metadata';

import { buildDataSourceOptions } from '@app/config';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { ProductEntity } from './entities/product.entity';
import { productsMigrations } from './migrations';

loadEnv();

export default new DataSource(
  buildDataSourceOptions('PRODUCTS', [ProductEntity], productsMigrations),
);
