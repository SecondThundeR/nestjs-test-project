import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

export async function startTestPostgres(database: string) {
  const directory = 'test-results/integration';
  mkdirSync(directory, { recursive: true });
  const file = `${directory}/${database}-${randomUUID()}.log`;
  const image = 'postgres:19.0-alpine';
  appendFileSync(file, `Starting ${image}\n`);
  try {
    return await new PostgreSqlContainer(image)
      .withDatabase(database)
      .withLogConsumer((stream) => {
        stream.on('data', (chunk: Buffer | string) =>
          appendFileSync(file, chunk),
        );
      })
      .start();
  } catch (error) {
    appendFileSync(file, `${String(error)}\n`);
    throw error;
  }
}
