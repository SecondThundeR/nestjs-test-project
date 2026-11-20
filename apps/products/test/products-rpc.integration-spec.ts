import type { AddressInfo, Server } from 'node:net';
import {
  type Product,
  PRODUCT_PATTERNS,
  type ProductDeleteResult,
} from '@app/domains';
import {
  GlobalRpcExceptionFilter,
  rpcStandardSchemaExceptionFactory,
} from '@app/filters';
import {
  type INestMicroservice,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import {
  type ClientProxy,
  ClientProxyFactory,
  type MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { firstValueFrom } from 'rxjs';

import {
  configureTestPostgres,
  startTestPostgres,
} from '../../../test/utils/postgresql.js';
import {
  configureTestRedis,
  startTestRedis,
} from '../../../test/utils/redis.js';
import { ProductsModule } from './../src/products.module.js';

const HOST = '127.0.0.1';

describe('Products microservice (e2e)', () => {
  let postgres: Awaited<ReturnType<typeof startTestPostgres>> | undefined;
  let redis: Awaited<ReturnType<typeof startTestRedis>> | undefined;
  let app: INestMicroservice;
  let client: ClientProxy;

  beforeAll(async () => {
    postgres = await startTestPostgres('products_rpc');
    configureTestPostgres('PRODUCTS', postgres);
    redis = await startTestRedis('products-rpc');
    configureTestRedis(redis);

    const moduleFixture = await Test.createTestingModule({
      imports: [ProductsModule],
    }).compile();

    app = moduleFixture.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.TCP,
      options: { host: HOST, port: 0 },
    });
    app.useGlobalPipes(
      new StandardSchemaValidationPipe({
        transform: true,
        exceptionFactory: rpcStandardSchemaExceptionFactory,
      }),
    );
    app.useGlobalFilters(new GlobalRpcExceptionFilter());
    await app.listen();
    const { port } = app.unwrap<Server>().address() as AddressInfo;

    client = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: { host: HOST, port },
    });
    await client.connect();
  });

  afterAll(async () => {
    try {
      try {
        await client?.close();
      } finally {
        await app?.close();
      }
    } finally {
      vi.unstubAllEnvs();
      await Promise.all([redis?.container.stop(), postgres?.stop()]);
    }
  });

  function send<T>(pattern: string, payload: unknown): Promise<T> {
    return firstValueFrom(client.send<T>(pattern, payload));
  }

  it('drives the full CRUD lifecycle over TCP', async () => {
    const created = await send<Product>(PRODUCT_PATTERNS.CREATE, {
      name: 'Widget',
      price: 10,
      stock: 5,
    });
    expect(created).toMatchObject({ name: 'Widget', price: 10, stock: 5 });
    expect(typeof created.id).toBe('string');

    const found = await send<Product>(PRODUCT_PATTERNS.FIND_ONE, created.id);
    expect(found.id).toBe(created.id);

    const all = await send<Product[]>(PRODUCT_PATTERNS.FIND_ALL, {});
    expect(all.map((p) => p.id)).toContain(created.id);

    const many = await send<Product[]>(PRODUCT_PATTERNS.FIND_MANY, [
      created.id,
      'missing',
    ]);
    expect(many).toHaveLength(1);
    expect(many[0].id).toBe(created.id);

    const updated = await send<Product>(PRODUCT_PATTERNS.UPDATE, {
      id: created.id,
      data: { price: 12 },
    });
    expect(updated.price).toBe(12);
    expect(updated.stock).toBe(5);

    const removed = await send<ProductDeleteResult>(
      PRODUCT_PATTERNS.REMOVE,
      created.id,
    );
    expect(removed).toEqual({ id: created.id, deleted: true });
  });

  it('rejects finding an unknown product', async () => {
    await expect(
      send<Product>(PRODUCT_PATTERNS.FIND_ONE, 'missing'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects an invalid create payload via the validation pipe', async () => {
    await expect(
      send<Product>(PRODUCT_PATTERNS.CREATE, { name: 'x', price: -1 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
