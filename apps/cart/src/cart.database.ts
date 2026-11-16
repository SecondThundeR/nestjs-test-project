import type { DataSourceOptions } from 'typeorm';

import { CartSchema } from './schemas/cart.schema.js';

export function cartDatabaseOptions(
  uri = 'mongodb://127.0.0.1:27017/cart',
): DataSourceOptions {
  return {
    type: 'mongodb',
    url: uri,
    entities: [CartSchema],
    synchronize: false,
    migrationsRun: false,
    extra: { serverSelectionTimeoutMS: 5000 },
  };
}
