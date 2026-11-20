import type { AddressInfo, Server } from 'node:net';
import { KAFKA_CLIENT, SERVICE_NAMES } from '@app/config';
import { type Cart, CART_PATTERNS, type Product } from '@app/domains';
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
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, of } from 'rxjs';

import { startTestMongo } from '../../../test/utils/mongodb.js';
import { CartModule } from './../src/cart.module.js';

const HOST = '127.0.0.1';
const USER = 'user-1';

function makeProduct(overrides: Partial<Product> = {}): Product {
  const now = new Date().toISOString();
  return {
    id: 'p-1',
    name: 'Widget',
    description: '',
    price: 10,
    stock: 100,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Cart microservice (e2e)', () => {
  let mongo: Awaited<ReturnType<typeof startTestMongo>> | undefined;
  let app: INestMicroservice;
  let client: ClientProxy;
  const productsClient = { send: vi.fn(), emit: vi.fn() };

  beforeAll(async () => {
    mongo = await startTestMongo();
    const moduleFixture = await Test.createTestingModule({
      imports: [CartModule],
    })
      .overrideProvider(KAFKA_CLIENT)
      .useValue({
        connect: vi.fn(),
        close: vi.fn(),
        emit: vi.fn(() => of(undefined)),
      })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          CART_MONGODB_URI: `mongodb://${mongo.getHost()}:${mongo.getMappedPort(27017)}/cart`,
        }),
      )
      .overrideProvider(SERVICE_NAMES.PRODUCTS)
      .useValue(productsClient)
      .compile();

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
  }, 120000);

  afterAll(async () => {
    try {
      await client?.close();
      await app?.close();
    } finally {
      await mongo?.stop();
    }
  });

  beforeEach(() => {
    productsClient.send.mockReset();
    productsClient.send.mockReturnValue(of(makeProduct()));
  });

  function send<T>(pattern: string, payload: unknown): Promise<T> {
    return firstValueFrom(client.send<T>(pattern, payload));
  }

  it('returns an empty cart for an unknown user', async () => {
    const cart = await send<Cart>(CART_PATTERNS.GET, USER);

    expect(cart).toMatchObject({ userId: USER, items: [], total: 0 });
  });

  it('adds an item and computes totals', async () => {
    const cart = await send<Cart>(CART_PATTERNS.ADD_ITEM, {
      userId: USER,
      item: { productId: 'p-1', quantity: 2 },
    });

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]).toMatchObject({
      productId: 'p-1',
      quantity: 2,
      subtotal: 20,
    });
    expect(cart.total).toBe(20);
  });

  it('persists the cart across requests', async () => {
    const cart = await send<Cart>(CART_PATTERNS.GET, USER);

    expect(cart.items).toHaveLength(1);
    expect(cart.total).toBe(20);
  });

  it('updates an item quantity', async () => {
    const cart = await send<Cart>(CART_PATTERNS.UPDATE_ITEM, {
      userId: USER,
      productId: 'p-1',
      quantity: 5,
    });

    expect(cart.items[0]).toMatchObject({ quantity: 5, subtotal: 50 });
    expect(cart.total).toBe(50);
  });

  it('removes an item', async () => {
    const cart = await send<Cart>(CART_PATTERNS.REMOVE_ITEM, {
      userId: USER,
      productId: 'p-1',
    });

    expect(cart.items).toHaveLength(0);
    expect(cart.total).toBe(0);
  });

  it('clears the cart', async () => {
    await send<Cart>(CART_PATTERNS.ADD_ITEM, {
      userId: USER,
      item: { productId: 'p-1', quantity: 1 },
    });

    const cart = await send<Cart>(CART_PATTERNS.CLEAR, USER);

    expect(cart.items).toHaveLength(0);
    expect(cart.total).toBe(0);
  });

  it('surfaces RPC errors when a product is missing', async () => {
    productsClient.send.mockReturnValue(of(null));

    await expect(
      send<Cart>(CART_PATTERNS.ADD_ITEM, {
        userId: USER,
        item: { productId: 'missing', quantity: 1 },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
