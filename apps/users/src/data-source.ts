import 'reflect-metadata';

import { buildDataSourceOptions } from '@app/config';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { UserEntity } from './entities/user.entity';
import { usersMigrations } from './migrations';

loadEnv();

export default new DataSource(
  buildDataSourceOptions('USERS', [UserEntity], usersMigrations),
);
