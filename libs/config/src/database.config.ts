import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';

type ServiceKey = 'PRODUCTS' | 'CART' | 'ORDERS' | 'USERS' | 'AUTH';

export function buildDatabaseOptions(
  service: ServiceKey,
  entities: EntityClassOrSchema[],
): TypeOrmModuleOptions {
  const prefix = `${service}_DB`;

  return {
    type: 'postgres',
    host: process.env[`${prefix}_HOST`] ?? '127.0.0.1',
    port: Number(process.env[`${prefix}_PORT`] ?? 5432),
    username: process.env[`${prefix}_USERNAME`] ?? 'postgres',
    password: process.env[`${prefix}_PASSWORD`] ?? 'postgres',
    database: process.env[`${prefix}_NAME`] ?? service.toLowerCase(),
    entities,
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
  };
}

export const numericTransformer = {
  to: (value: number) => value,
  from: (value: string) => parseFloat(value),
};

export const isoTransformer = {
  to: (value: string) => value,
  from: (value: Date) => value.toISOString(),
};

export const nullableIsoTransformer = {
  to: (value: string | null) => value,
  from: (value: Date | null) => (value ? value.toISOString() : null),
};
