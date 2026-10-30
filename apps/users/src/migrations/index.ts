import type { DataSourceOptions } from 'typeorm';

import { InitUsers1781193214624 } from './1781193214624-InitUsers.js';
import { AddUserRole1781654400000 } from './1781654400000-AddUserRole.js';
import { SeedAdminUser1781740800000 } from './1781740800000-SeedAdminUser.js';
import { RemoveDefaultAdmin1793361600000 } from './1793361600000-RemoveDefaultAdmin.js';

export const usersMigrations: NonNullable<DataSourceOptions['migrations']> = [
  InitUsers1781193214624,
  AddUserRole1781654400000,
  SeedAdminUser1781740800000,
  RemoveDefaultAdmin1793361600000,
];
