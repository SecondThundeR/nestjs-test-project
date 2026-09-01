import type { DataSourceOptions } from 'typeorm';

import { InitUsers1781193214624 } from './1781193214624-InitUsers.js';
import { AddUserRole1781654400000 } from './1781654400000-AddUserRole.js';
import { SeedAdminUser1781740800000 } from './1781740800000-SeedAdminUser.js';

export const usersMigrations: NonNullable<DataSourceOptions['migrations']> = [
  InitUsers1781193214624,
  AddUserRole1781654400000,
  SeedAdminUser1781740800000,
];
