import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { startContainerWithLogs } from './container-logs.js';

export function startTestPostgres(database: string) {
  const image = 'postgres:19.0-alpine';
  const container = new PostgreSqlContainer(image).withDatabase(database);
  return startContainerWithLogs(container, image, database);
}

export function configureTestPostgres(
  service: 'AUTH' | 'ORDERS' | 'PRODUCTS' | 'USERS',
  postgres: Awaited<ReturnType<typeof startTestPostgres>>,
) {
  vi.stubEnv(`${service}_DB_HOST`, postgres.getHost());
  vi.stubEnv(`${service}_DB_PORT`, String(postgres.getPort()));
  vi.stubEnv(`${service}_DB_USERNAME`, postgres.getUsername());
  vi.stubEnv(`${service}_DB_PASSWORD`, postgres.getPassword());
  vi.stubEnv(`${service}_DB_NAME`, postgres.getDatabase());
  vi.stubEnv('DB_SYNCHRONIZE', 'false');
  vi.stubEnv('DB_MIGRATIONS_RUN', 'true');
}

export function usePostgresTestDatabase(
  name: string,
  source: DataSource,
  tables: readonly string[],
) {
  let postgres: Awaited<ReturnType<typeof startTestPostgres>> | undefined;
  let database: DataSource;

  beforeAll(async () => {
    postgres = await startTestPostgres(name);
    database = new DataSource({
      type: 'postgres',
      url: postgres.getConnectionUri(),
      entities: source.options.entities,
      migrations: source.options.migrations,
      migrationsTableName: source.options.migrationsTableName,
      migrationsRun: true,
      synchronize: false,
    });
    await database.initialize();
  });

  beforeEach(async () => {
    const names = tables.map((table) => database.driver.escape(table));
    await database.query(`TRUNCATE TABLE ${names.join(', ')}`);
  });

  afterAll(async () => {
    try {
      if (database?.isInitialized) await database.destroy();
    } finally {
      await postgres?.stop();
    }
  });

  return () => database;
}
