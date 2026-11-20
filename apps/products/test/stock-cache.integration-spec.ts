import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import { DataSource } from 'typeorm';
import { startContainerWithLogs } from '../../../test/utils/container-logs.js';
import { startTestPostgres } from '../../../test/utils/postgresql.js';
import { ProductEntity } from '../src/entities/product.entity.js';
import { ProductsService } from '../src/products.service.js';

describe('Product stock cache (PostgreSQL and Redis)', () => {
  const redisPassword = 'test-redis-password';
  let postgres: Awaited<ReturnType<typeof startTestPostgres>> | undefined;
  let redis: StartedTestContainer | undefined;
  let module: TestingModule | undefined;

  beforeAll(async () => {
    postgres = await startTestPostgres('products_cache');

    const image = 'redis:8.10.3-alpine';
    const container = new GenericContainer(image)
      .withExposedPorts(6379)
      .withCommand(['redis-server', '--requirepass', redisPassword])
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/));
    redis = await startContainerWithLogs(container, image, 'redis-products');

    vi.stubEnv('JWT_SECRET', 'test-jwt-secret');
    vi.stubEnv('PRODUCTS_DB_HOST', postgres.getHost());
    vi.stubEnv('PRODUCTS_DB_PORT', String(postgres.getPort()));
    vi.stubEnv('PRODUCTS_DB_USERNAME', postgres.getUsername());
    vi.stubEnv('PRODUCTS_DB_PASSWORD', postgres.getPassword());
    vi.stubEnv('PRODUCTS_DB_NAME', postgres.getDatabase());
    vi.stubEnv('DB_SYNCHRONIZE', 'false');
    vi.stubEnv('DB_MIGRATIONS_RUN', 'true');
    vi.stubEnv('REDIS_HOST', redis.getHost());
    vi.stubEnv('REDIS_PORT', String(redis.getMappedPort(6379)));
    vi.stubEnv('REDIS_PASSWORD', redisPassword);
    vi.stubEnv('PRODUCTS_CACHE_TTL', '60000');

    const { ProductsModule } = await import('../src/products.module.js');
    module = await Test.createTestingModule({
      imports: [ProductsModule],
    }).compile();
    await module.init();
  });

  afterAll(async () => {
    try {
      await module?.close();
    } finally {
      vi.unstubAllEnvs();
      await Promise.all([redis?.stop(), postgres?.stop()]);
    }
  });

  async function redisCli(...args: string[]) {
    const result = await redis!.exec(['redis-cli', '--raw', ...args], {
      env: { REDISCLI_AUTH: redisPassword },
    });
    if (result.exitCode !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  }

  it('evicts the cached stock on reservation and caches the new PostgreSQL value on read', async () => {
    const service = module!.get(ProductsService);
    const db = module!.get(DataSource);
    const product = await service.create({
      name: 'Cached product',
      price: 10,
      stock: 5,
    });

    expect(await service.findOne(product.id)).toMatchObject({ stock: 5 });
    const key = await redisCli('--scan', '--pattern', `*product:${product.id}`);
    expect(key).toBeTruthy();
    expect(JSON.parse(await redisCli('GET', key))).toMatchObject({
      value: { id: product.id, stock: 5 },
    });

    await service.reserveStock({
      reservationId: randomUUID(),
      items: [{ productId: product.id, quantity: 2 }],
    });
    expect(await redisCli('EXISTS', key)).toBe('0');
    const persisted = await db
      .getRepository(ProductEntity)
      .findOneByOrFail({ id: product.id });
    expect(persisted.stock).toBe(3);
    expect(await service.findOne(product.id)).toMatchObject({
      stock: persisted.stock,
    });
    expect(JSON.parse(await redisCli('GET', key))).toMatchObject({
      value: { id: product.id, stock: 3 },
    });
  });
});
