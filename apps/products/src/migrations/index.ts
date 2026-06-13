import type { DataSourceOptions } from 'typeorm';

import { InitProducts1781193171715 } from './1781193171715-InitProducts';

export const productsMigrations: NonNullable<DataSourceOptions['migrations']> =
  [InitProducts1781193171715];
