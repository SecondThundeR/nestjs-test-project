import { Test } from '@nestjs/testing';
import { type INestMicroservice, ValidationPipe } from '@nestjs/common';
import {
  type ClientProxy,
  ClientProxyFactory,
  type MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';
import { firstValueFrom, of } from 'rxjs';
import {
  CART_PATTERNS,
  GlobalRpcExceptionFilter,
  rpcValidationExceptionFactory,
  SERVICE_NAMES,
  type Cart,
  type Product,
} from '@app/contracts';
import { CartModule } from './../src/cart.module';

const HOST = '127.0.0.1';
const PORT = 4002;
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
  let app: INestMicroservice;
  let client: ClientProxy;
  const productsClient = { send: jest.fn(), emit: jest.fn() };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [CartModule],
    })
      .overrideProvider(SERVICE_NAMES.PRODUCTS)
      .useValue(productsClient)
      .compile();

    app = moduleFixture.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.TCP,
      options: { host: HOST, port: PORT },
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: rpcValidationExceptionFactory,
      }),
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
