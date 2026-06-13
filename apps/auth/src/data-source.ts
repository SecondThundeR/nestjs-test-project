import 'reflect-metadata';

import { buildDataSourceOptions } from '@app/config';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { SessionEntity } from './entities/session.entity';
import { authMigrations } from './migrations';

loadEnv();

export default new DataSource(
  buildDataSourceOptions('AUTH', [SessionEntity], authMigrations),
);
