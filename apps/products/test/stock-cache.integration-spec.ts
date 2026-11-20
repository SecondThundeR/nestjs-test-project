import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { startTestPostgres } from '../../../test/utils/postgresql.js';
import {
  configureTestRedis,
  startTestRedis,
} from '../../../test/utils/redis.js';
import { ProductEntity } from '../src/entities/product.entity.js';
import { ProductsService } from '../src/products.service.js';

describe('Product stock cache (PostgreSQL and Redis)', () => {
  let postgres: Awaited<ReturnType<typeof startTestPostgres>> | undefined;
  let redis: Awaited<ReturnType<typeof startTestRedis>> | undefined;
  let module: TestingModule | undefined;

  beforeAll(async () => {
    postgres = await startTestPostgres('products_cache');

    redis = await startTestRedis('products');

    vi.stubEnv('JWT_SECRET', 'test-jwt-secret');
    vi.stubEnv('PRODUCTS_DB_HOST', postgres.getHost());
    vi.stubEnv('PRODUCTS_DB_PORT', String(postgres.getPort()));
    vi.stubEnv('PRODUCTS_DB_USERNAME', postgres.getUsername());
    vi.stubEnv('PRODUCTS_DB_PASSWORD', postgres.getPassword());
    vi.stubEnv('PRODUCTS_DB_NAME', postgres.getDatabase());
    vi.stubEnv('DB_SYNCHRONIZE', 'false');
    vi.stubEnv('DB_MIGRATIONS_RUN', 'true');
    configureTestRedis(redis);
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
      await Promise.all([redis?.container.stop(), postgres?.stop()]);
    }
  });

  it('evicts the cached stock on reservation and caches the new PostgreSQL value on read', async () => {
    const service = module!.get(ProductsService);
    const db = module!.get(DataSource);
    const product = await service.create({
      name: 'Cached product',
      price: 10,
      stock: 5,
    });

    expect(await service.findOne(product.id)).toMatchObject({ stock: 5 });
    const key = await redis!.cli(
      '--scan',
      '--pattern',
      `*product:${product.id}`,
    );
    expect(key).toBeTruthy();
    expect(JSON.parse(await redis!.cli('GET', key))).toMatchObject({
      value: { id: product.id, stock: 5 },
    });

    await service.reserveStock({
      reservationId: randomUUID(),
      items: [{ productId: product.id, quantity: 2 }],
    });
    expect(await redis!.cli('EXISTS', key)).toBe('0');
    const persisted = await db
      .getRepository(ProductEntity)
      .findOneByOrFail({ id: product.id });
    expect(persisted.stock).toBe(3);
    expect(await service.findOne(product.id)).toMatchObject({
      stock: persisted.stock,
    });
    expect(JSON.parse(await redis!.cli('GET', key))).toMatchObject({
      value: { id: product.id, stock: 3 },
    });
  });
});
