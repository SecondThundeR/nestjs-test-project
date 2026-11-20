import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import type { StartedTestContainer, TestContainer } from 'testcontainers';

export async function startContainerWithLogs<T extends StartedTestContainer>(
  container: Pick<TestContainer, 'withLogConsumer'> & { start(): Promise<T> },
  image: string,
  name: string,
): Promise<T> {
  const directory = 'test-results/integration';
  mkdirSync(directory, { recursive: true });
  const log = `${directory}/${name}-${randomUUID()}.log`;
  appendFileSync(log, `Starting ${image}\n`);

  container.withLogConsumer((stream) => {
    stream.on('data', (chunk: Buffer | string) => appendFileSync(log, chunk));
  });

  try {
    return await container.start();
  } catch (error) {
    appendFileSync(log, `${String(error)}\n`);
    throw error;
  }
}
