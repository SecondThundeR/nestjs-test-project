import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '@app/config';
import { ProductEntity } from './entities/product.entity';
import { productsMigrations } from './migrations';

loadEnv();

export default new DataSource(
  buildDataSourceOptions('PRODUCTS', [ProductEntity], productsMigrations),
);
