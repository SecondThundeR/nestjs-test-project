import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../../../libs/config/src/index.js';
import { SessionEntity } from './entities/session.entity.js';
import { authMigrations } from './migrations/index.js';

loadEnv();

export default new DataSource(
  buildDataSourceOptions('AUTH', [SessionEntity], authMigrations),
);
