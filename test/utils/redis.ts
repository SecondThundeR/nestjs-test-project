import { buildCacheManagerOptions, CacheService } from '@app/cache';
import { CACHE_MANAGER, CacheModule } from '@nestjs/cache-manager';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Cache } from 'cache-manager';
import { GenericContainer, Wait } from 'testcontainers';
import { startContainerWithLogs } from './container-logs.js';

export async function startTestRedis(name: string) {
  const image = 'redis:8.10.3-alpine';
  const password = 'test-redis-password';
  const container = await startContainerWithLogs(
    new GenericContainer(image)
      .withExposedPorts(6379)
      .withCommand(['redis-server', '--requirepass', password])
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/)),
    image,
    `redis-${name}`,
  );
  return {
    container,
    options: {
      host: container.getHost(),
      port: container.getMappedPort(6379),
      password,
    },
    async cli(...args: string[]) {
      const result = await container.exec(['redis-cli', '--raw', ...args], {
        env: { REDISCLI_AUTH: password },
      });
      if (result.exitCode !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    },
  };
}

export function configureTestRedis(
  redis: Awaited<ReturnType<typeof startTestRedis>>,
) {
  vi.stubEnv('REDIS_HOST', redis.options.host);
  vi.stubEnv('REDIS_PORT', String(redis.options.port));
  vi.stubEnv('REDIS_PASSWORD', redis.options.password);
}

export function useRedisTestCaches<T extends string>(
  name: string,
  ...namespaces: T[]
) {
  let redis: Awaited<ReturnType<typeof startTestRedis>> | undefined;
  const modules: TestingModule[] = [];
  const caches = new Map<T, { service: CacheService; manager: Cache }>();

  beforeAll(async () => {
    redis = await startTestRedis(name);
    for (const namespace of namespaces) {
      const options = buildCacheManagerOptions({
        namespace,
        redis: redis.options,
      });
      const module = await Test.createTestingModule({
        imports: [CacheModule.register(options)],
        providers: [CacheService],
      }).compile();
      modules.push(module);
      caches.set(namespace, {
        service: module.get(CacheService),
        manager: module.get<Cache>(CACHE_MANAGER),
      });
    }
  });

  beforeEach(async () => {
    await Promise.all(
      [...caches.values()].map(({ manager }) => manager.clear()),
    );
  });

  afterAll(async () => {
    try {
      await Promise.all(modules.map((module) => module.close()));
    } finally {
      await redis?.container.stop();
    }
  });

  return (namespace: T) => caches.get(namespace)!;
}
