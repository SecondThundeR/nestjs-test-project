import { Test } from '@nestjs/testing';
import { type INestMicroservice, ValidationPipe } from '@nestjs/common';
import {
  type ClientProxy,
  ClientProxyFactory,
  type MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';
import { getDataSourceToken } from '@nestjs/typeorm';
import { firstValueFrom, of } from 'rxjs';
import {
  CART_PATTERNS,
  ORDERS_PATTERNS,
  OrderStatus,
  PRODUCT_PATTERNS,
  type Cart,
  type CartItem,
  type Order,
  type OrderPayment,
  type Product,
} from '@app/domains';
import { SERVICE_NAMES } from '@app/config';
import {
  rpcValidationExceptionFactory,
  GlobalRpcExceptionFilter,
} from '@app/filters';
import { createInMemoryDataSource } from './../../../test/utils/in-memory-database';
import { OrdersModule } from './../src/orders.module';
import { OrderEntity } from './../src/entities/order.entity';
import { PaypalService } from './../src/paypal/paypal.service';

const HOST = '127.0.0.1';
const PORT = 4003;
const USER = 'user-1';
const ADDRESS = '1 Test Street';

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

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: 'p-1',
    name: 'Widget',
    price: 10,
    quantity: 2,
    subtotal: 20,
    ...overrides,
  };
}

describe('Orders microservice (e2e)', () => {
  let app: INestMicroservice;
  let client: ClientProxy;
  const productsClient = { send: jest.fn(), emit: jest.fn() };
  const cartClient = { send: jest.fn(), emit: jest.fn() };
  const paypal = {
    createOrder: jest.fn(),
    captureOrder: jest.fn(),
    refundCapture: jest.fn(),
  };

  beforeAll(async () => {
    const dataSource = await createInMemoryDataSource([OrderEntity]);

    const moduleFixture = await Test.createTestingModule({
      imports: [OrdersModule],
    })
      .overrideProvider(getDataSourceToken())
      .useValue(dataSource)
      .overrideProvider(SERVICE_NAMES.PRODUCTS)
      .useValue(productsClient)
      .overrideProvider(SERVICE_NAMES.CART)
      .useValue(cartClient)
      .overrideProvider(PaypalService)
      .useValue(paypal)
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
    cartClient.send.mockReset();
    paypal.createOrder.mockReset();
    paypal.captureOrder.mockReset();
    paypal.refundCapture.mockReset();
  });

  function send<T>(pattern: string, payload: unknown): Promise<T> {
    return firstValueFrom(client.send<T>(pattern, payload));
  }

  function mockHappyPath() {
    cartClient.send.mockImplementation((pattern: string) =>
      pattern === CART_PATTERNS.GET
        ? of({
            userId: USER,
            items: [makeCartItem()],
            total: 20,
            updatedAt: new Date().toISOString(),
          } satisfies Cart)
        : of(undefined),
    );
    productsClient.send.mockImplementation((pattern: string) =>
      pattern === PRODUCT_PATTERNS.FIND_MANY
        ? of([makeProduct({ stock: 5 })])
        : of(makeProduct()),
    );
  }

  it('drives the full order lifecycle over TCP', async () => {
    mockHappyPath();

    const order = await send<Order>(ORDERS_PATTERNS.CREATE, {
      userId: USER,
      shippingAddress: ADDRESS,
    });
    expect(order).toMatchObject({
      userId: USER,
      status: OrderStatus.PENDING,
      total: 20,
    });

    const found = await send<Order>(ORDERS_PATTERNS.FIND_ONE, order.id);
    expect(found.id).toBe(order.id);

    const all = await send<Order[]>(ORDERS_PATTERNS.FIND_ALL, USER);
    expect(all.map((o) => o.id)).toContain(order.id);

    paypal.createOrder.mockResolvedValue({
      id: 'pp-1',
      status: 'CREATED',
      approveUrl: 'https://paypal.test/approve',
    });
    const payment = await send<OrderPayment>(ORDERS_PATTERNS.PAY, order.id);
    expect(payment).toEqual({
      orderId: order.id,
      paymentId: 'pp-1',
      paymentStatus: 'CREATED',
      approveUrl: 'https://paypal.test/approve',
    });

    paypal.captureOrder.mockResolvedValue({
      id: 'pp-1',
      status: 'COMPLETED',
      approveUrl: null,
    });
    const paid = await send<Order>(ORDERS_PATTERNS.CAPTURE_PAYMENT, order.id);
    expect(paid.status).toBe(OrderStatus.PAID);

    const shipped = await send<Order>(ORDERS_PATTERNS.UPDATE_STATUS, {
      id: order.id,
      status: OrderStatus.SHIPPED,
    });
    expect(shipped.status).toBe(OrderStatus.SHIPPED);

    const delivered = await send<Order>(ORDERS_PATTERNS.UPDATE_STATUS, {
      id: order.id,
      status: OrderStatus.DELIVERED,
    });
    expect(delivered.status).toBe(OrderStatus.DELIVERED);
  });

  it('cancels a pending order and restores the stock', async () => {
    mockHappyPath();

    const order = await send<Order>(ORDERS_PATTERNS.CREATE, {
      userId: USER,
      shippingAddress: ADDRESS,
    });

    productsClient.send.mockImplementation((pattern: string) =>
      pattern === PRODUCT_PATTERNS.FIND_ONE
        ? of(makeProduct({ stock: 3 }))
        : of(makeProduct()),
    );
    const cancelled = await send<Order>(ORDERS_PATTERNS.CANCEL, order.id);
    expect(cancelled.status).toBe(OrderStatus.CANCELLED);
  });

  it('refunds the payment when cancelling a paid order', async () => {
    mockHappyPath();

    const order = await send<Order>(ORDERS_PATTERNS.CREATE, {
      userId: USER,
      shippingAddress: ADDRESS,
    });

    paypal.createOrder.mockResolvedValue({
      id: 'pp-refund-1',
      status: 'PAYER_ACTION_REQUIRED',
      approveUrl: 'https://paypal.test/checkoutnow',
    });
    await send<OrderPayment>(ORDERS_PATTERNS.PAY, order.id);

    paypal.captureOrder.mockResolvedValue({
      id: 'pp-refund-1',
      status: 'COMPLETED',
      approveUrl: null,
      captureId: 'cap-refund-1',
    });
    await send<Order>(ORDERS_PATTERNS.CAPTURE_PAYMENT, order.id);

    paypal.refundCapture.mockResolvedValue({
      id: 'ref-1',
      status: 'COMPLETED',
    });
    productsClient.send.mockImplementation((pattern: string) =>
      pattern === PRODUCT_PATTERNS.FIND_ONE
        ? of(makeProduct({ stock: 3 }))
        : of(makeProduct()),
    );
    const cancelled = await send<Order>(ORDERS_PATTERNS.CANCEL, order.id);

    expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    expect(paypal.refundCapture).toHaveBeenCalledWith('cap-refund-1');
  });

  it('captures a payment by the PayPal return token', async () => {
    mockHappyPath();

    const order = await send<Order>(ORDERS_PATTERNS.CREATE, {
      userId: USER,
      shippingAddress: ADDRESS,
    });

    paypal.createOrder.mockResolvedValue({
      id: 'pp-token-1',
      status: 'PAYER_ACTION_REQUIRED',
      approveUrl: 'https://paypal.test/checkoutnow',
    });
    await send<OrderPayment>(ORDERS_PATTERNS.PAY, order.id);

    paypal.captureOrder.mockResolvedValue({
      id: 'pp-token-1',
      status: 'COMPLETED',
      approveUrl: null,
    });
    const paid = await send<Order>(
      ORDERS_PATTERNS.CAPTURE_BY_PAYMENT_ID,
      'pp-token-1',
    );
    expect(paid.id).toBe(order.id);
    expect(paid.status).toBe(OrderStatus.PAID);
  });

  it('rejects shipping an order that has not been paid', async () => {
    mockHappyPath();

    const order = await send<Order>(ORDERS_PATTERNS.CREATE, {
      userId: USER,
      shippingAddress: ADDRESS,
    });

    await expect(
      send<Order>(ORDERS_PATTERNS.UPDATE_STATUS, {
        id: order.id,
        status: OrderStatus.SHIPPED,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects creating an order from an empty cart', async () => {
    cartClient.send.mockReturnValue(
      of({
        userId: USER,
        items: [],
        total: 0,
        updatedAt: new Date().toISOString(),
      } satisfies Cart),
    );

    await expect(
      send<Order>(ORDERS_PATTERNS.CREATE, {
        userId: USER,
        shippingAddress: ADDRESS,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects finding an unknown order', async () => {
    await expect(
      send<Order>(ORDERS_PATTERNS.FIND_ONE, 'missing'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
