import type { DataSourceOptions } from 'typeorm';

import { InitAuth1781193215600 } from './1781193215600-InitAuth';

export const authMigrations: NonNullable<DataSourceOptions['migrations']> = [
  InitAuth1781193215600,
];
