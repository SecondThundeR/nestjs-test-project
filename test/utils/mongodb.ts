import { MongoMemoryServer } from 'mongodb-memory-server';

export function createTestMongo(): Promise<MongoMemoryServer> {
  return MongoMemoryServer.create({ binary: { version: '8.0.17' } });
}
