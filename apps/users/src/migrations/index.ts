import type { DataSourceOptions } from 'typeorm';
import { InitUsers1781193214624 } from './1781193214624-InitUsers';

export const usersMigrations: NonNullable<DataSourceOptions['migrations']> = [
  InitUsers1781193214624,
];
