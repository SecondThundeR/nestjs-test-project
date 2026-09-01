import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../../../libs/config/src/index.js';
import { UserEntity } from './entities/user.entity.js';
import { usersMigrations } from './migrations/index.js';

loadEnv();

export default new DataSource(
  buildDataSourceOptions('USERS', [UserEntity], usersMigrations),
);
