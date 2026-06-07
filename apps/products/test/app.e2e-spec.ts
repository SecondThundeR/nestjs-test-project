import { Test, TestingModule } from '@nestjs/testing';
import { INestMicroservice, ValidationPipe } from '@nestjs/common';
import {
  ClientProxy,
  ClientProxyFactory,
  MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  GlobalRpcExceptionFilter,
  PRODUCT_PATTERNS,
  type Product,
} from '@app/contracts';
import { ProductsModule } from './../src/products.module';

const HOST = '127.0.0.1';
const PORT = 4001;

describe('Products microservice (e2e)', () => {
  let app: INestMicroservice;
  let client: ClientProxy;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ProductsModule],
    }).compile();

    app = moduleFixture.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.TCP,
      options: { host: HOST, port: PORT },
    });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new GlobalRpcExceptionFilter());
    await app.listen();

    client = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: { host: HOST, port: PORT },
    });
    await client.connect();
  });

  afterAll(async () => {
    await client.close();
    await app.close();
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

    const removed = await send<{ id: string; deleted: boolean }>(
      PRODUCT_PATTERNS.REMOVE,
      created.id,
    );
    expect(removed).toEqual({ id: created.id, deleted: true });
  });

  it('rejects finding an unknown product', async () => {
    await expect(
      send<Product>(PRODUCT_PATTERNS.FIND_ONE, 'missing'),
    ).rejects.toMatchObject({ status: 'error' });
  });

  it('rejects an invalid create payload via the validation pipe', async () => {
    await expect(
      send<Product>(PRODUCT_PATTERNS.CREATE, { name: 'x', price: -1 }),
    ).rejects.toMatchObject({ status: 'error' });
  });
});
