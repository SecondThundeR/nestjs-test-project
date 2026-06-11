import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import type { DataSourceOptions } from 'typeorm';

type ServiceKey = 'PRODUCTS' | 'CART' | 'ORDERS' | 'USERS' | 'AUTH';

type Migrations = NonNullable<DataSourceOptions['migrations']>;

function connectionParams(service: ServiceKey) {
  const prefix = `${service}_DB`;

  return {
    type: 'postgres' as const,
    host: process.env[`${prefix}_HOST`] ?? '127.0.0.1',
    port: Number(process.env[`${prefix}_PORT`] ?? 5432),
    username: process.env[`${prefix}_USERNAME`] ?? 'postgres',
    password: process.env[`${prefix}_PASSWORD`] ?? 'postgres',
    database: process.env[`${prefix}_NAME`] ?? service.toLowerCase(),
    migrationsTableName: 'migrations',
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    migrationsRun: process.env.DB_MIGRATIONS_RUN === 'true',
  };
}

export function buildDatabaseOptions(
  service: ServiceKey,
  entities: EntityClassOrSchema[],
  migrations: Migrations = [],
): TypeOrmModuleOptions {
  return { ...connectionParams(service), entities, migrations };
}

export function buildDataSourceOptions(
  service: ServiceKey,
  entities: DataSourceOptions['entities'],
  migrations: Migrations = [],
): DataSourceOptions {
  return { ...connectionParams(service), entities, migrations };
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
