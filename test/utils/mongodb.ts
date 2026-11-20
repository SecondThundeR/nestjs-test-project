import { GenericContainer, Wait } from 'testcontainers';
import { startContainerWithLogs } from './container-logs.js';

export function startTestMongo() {
  const image = 'mongo:9.0.8';
  const container = new GenericContainer(image)
    .withExposedPorts(27017)
    .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/));
  return startContainerWithLogs(container, image, 'mongo');
}
