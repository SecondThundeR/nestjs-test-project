import type { DataSourceOptions } from 'typeorm';

import { InitCart1781193212476 } from './1781193212476-InitCart';

export const cartMigrations: NonNullable<DataSourceOptions['migrations']> = [
  InitCart1781193212476,
];
