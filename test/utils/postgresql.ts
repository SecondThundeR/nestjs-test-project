import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { startContainerWithLogs } from './container-logs.js';

export function startTestPostgres(database: string) {
  const image = 'postgres:19.0-alpine';
  const container = new PostgreSqlContainer(image).withDatabase(database);
  return startContainerWithLogs(container, image, database);
}
