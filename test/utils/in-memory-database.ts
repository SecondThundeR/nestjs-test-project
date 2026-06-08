import type { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import { newDb } from 'pg-mem';
import type { DataSource } from 'typeorm';

export async function createInMemoryDataSource(
  entities: EntityClassOrSchema[],
): Promise<DataSource> {
  const db = newDb();

  db.public.registerFunction({
    name: 'current_database',
    implementation: () => 'test',
  });
  db.public.registerFunction({
    name: 'version',
    implementation: () => 'PostgreSQL 18.4 (pg-mem)',
  });

  db.public.interceptQueries((sql) =>
    sql.includes('obj_description') ? [] : null,
  );

  const dataSource = db.adapters.createTypeormDataSource({
    type: 'postgres',
    entities,
  }) as DataSource;

  await dataSource.initialize();
  await dataSource.synchronize();

  return dataSource;
}
