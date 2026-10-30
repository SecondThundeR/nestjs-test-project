import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../../../libs/config/src/index.js';
import { StockReservationEntity } from './entities/stock-reservation.entity.js';
import { ProductEntity } from './entities/product.entity.js';
import { productsMigrations } from './migrations/index.js';

loadEnv();

export default new DataSource(
  buildDataSourceOptions(
    'PRODUCTS',
    [ProductEntity, StockReservationEntity],
    productsMigrations,
  ),
);
