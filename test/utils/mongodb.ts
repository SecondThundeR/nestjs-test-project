import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { GenericContainer, Wait } from 'testcontainers';

export async function startTestMongo() {
  const image = 'mongo:9.0.8';
  const directory = 'test-results/integration';
  mkdirSync(directory, { recursive: true });
  const log = `${directory}/mongo-${randomUUID()}.log`;
  appendFileSync(log, `Starting ${image}\n`);

  try {
    return await new GenericContainer(image)
      .withExposedPorts(27017)
      .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
      .withLogConsumer((stream) => {
        stream.on('data', (chunk: Buffer | string) =>
          appendFileSync(log, chunk),
        );
      })
      .start();
  } catch (error) {
    appendFileSync(log, `${String(error)}\n`);
    throw error;
  }
}
