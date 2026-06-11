import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '@app/config';
import { UserEntity } from './entities/user.entity';
import { usersMigrations } from './migrations';

loadEnv();

export default new DataSource(
  buildDataSourceOptions('USERS', [UserEntity], usersMigrations),
);
