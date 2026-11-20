import { OrderOperationEntity } from '../src/entities/order-operation.entity.js';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CacheService } from '@app/cache';
import { SERVICE_NAMES } from '@app/config';
import {
  OrderStatus,
  PRODUCT_PATTERNS,
  reserveStockSchema,
  releaseStockSchema,
} from '@app/domains';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { defer, of, throwError } from 'rxjs';
import { DataSource, Repository } from 'typeorm';
import { useRedisTestCaches } from '../../../test/utils/redis.js';
import { startTestPostgres } from '../../../test/utils/postgresql.js';
import { onTestFinished } from 'vitest';
import { ProductEntity } from '../../products/src/entities/product.entity.js';
import { StockReservationEntity } from '../../products/src/entities/stock-reservation.entity.js';
import { productsMigrations } from '../../products/src/migrations/index.js';
import { ProductsService } from '../../products/src/products.service.js';
import { OrderEntity } from '../src/entities/order.entity.js';
import { StockIntentEntity } from '../src/entities/stock-intent.entity.js';
import { ordersMigrations } from '../src/migrations/index.js';
import { OrdersService } from '../src/orders.service.js';
import { PaypalService } from '../src/paypal/paypal.service.js';

describe('Stock recovery (PostgreSQL)', () => {
  const cache = useRedisTestCaches('stock-recovery', 'orders', 'products');
  let db: DataSource;
  let productsDb: DataSource;
  let ordersPostgres: Awaited<ReturnType<typeof startTestPostgres>> | undefined;
  let productsPostgres:
    Awaited<ReturnType<typeof startTestPostgres>> | undefined;
  let service: OrdersService;
  let products: ProductsService;
  let product: ProductEntity;
  let unavailable: boolean;
  let loseReserveResponse: boolean;
  const send = vi.fn();
  const paypal = {
    createOrder: vi.fn(),
    captureOrder: vi.fn(),
    refundCapture: vi.fn(),
  };
  beforeAll(async () => {
    ordersPostgres = await startTestPostgres('orders_recovery');
    db = new DataSource({
      type: 'postgres',
      url: ordersPostgres.getConnectionUri(),
      synchronize: false,
      entities: [OrderEntity, StockIntentEntity, OrderOperationEntity],
      migrations: ordersMigrations,
    });
    await db.initialize();
    await db.runMigrations();

    productsPostgres = await startTestPostgres('products_recovery');
    productsDb = new DataSource({
      type: 'postgres',
      url: productsPostgres.getConnectionUri(),
      synchronize: false,
      entities: [ProductEntity, StockReservationEntity],
      migrations: productsMigrations,
    });
    await productsDb.initialize();
    await productsDb.runMigrations();
  });
  beforeEach(async () => {
    await db.query('TRUNCATE order_operations, orders, stock_intents');
    await productsDb.query('TRUNCATE products, stock_reservations');
    paypal.createOrder
      .mockReset()
      .mockResolvedValue({ id: 'pp-1', status: 'CREATED', approveUrl: null });
    paypal.captureOrder.mockReset().mockResolvedValue({
      id: 'pp-1',
      status: 'COMPLETED',
      captureId: 'cap-1',
    });
    paypal.refundCapture
      .mockReset()
      .mockResolvedValue({ id: 'ref-1', status: 'COMPLETED' });
    unavailable = false;
    loseReserveResponse = false;
    products = new ProductsService(
      productsDb.getRepository(ProductEntity),
      cache('products').service,
    );
    product = await products.create({ name: 'Widget', price: 10, stock: 5 });
    send.mockImplementation((pattern: string, payload: unknown) => {
      if (pattern === PRODUCT_PATTERNS.FIND_MANY) return of([product]);
      if (pattern === PRODUCT_PATTERNS.RESERVE_STOCK)
        return defer(async () => {
          await products.reserveStock(reserveStockSchema.parse(payload));
          if (loseReserveResponse) throw new Error('response lost');
          return { success: true };
        });
      if (pattern === PRODUCT_PATTERNS.RELEASE_STOCK)
        return unavailable
          ? throwError(() => new Error('offline'))
          : defer(() =>
              products.releaseStock(releaseStockSchema.parse(payload)),
            );
      throw new Error('Unexpected RPC');
    });
    service = await createWorker();
  });

  async function createWorker(
    paymentAdapter: typeof paypal | PaypalService = paypal,
  ) {
    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: getRepositoryToken(OrderEntity),
          useValue: db.getRepository(OrderEntity),
        },
        { provide: CacheService, useValue: cache('orders').service },
        { provide: SERVICE_NAMES.PRODUCTS, useValue: { send } },
        {
          provide: SERVICE_NAMES.CART,
          useValue: {
            send: () => of({ items: [{ productId: product.id, quantity: 2 }] }),
          },
        },
        { provide: PaypalService, useValue: paymentAdapter },
      ],
    }).compile();
    onTestFinished(() => module.close());
    return module.get(OrdersService);
  }
  async function startPaypalFixture(handlePaymentRequest: RequestListener) {
    const server = createServer((request, response) => {
      if (request.url === '/v1/oauth2/token' && request.method === 'POST') {
        response.end(
          JSON.stringify({ access_token: 'test-token', expires_in: 300 }),
        );
        return;
      }
      handlePaymentRequest(request, response);
    });
    onTestFinished(async () => {
      const closed = once(server, 'close');
      server.close();
      server.closeAllConnections();
      await closed;
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const { port } = server.address() as AddressInfo;
    return () =>
      new PaypalService({
        apiUrl: `http://127.0.0.1:${port}`,
        clientId: 'test-client',
        clientSecret: 'test-secret',
        currency: 'USD',
        returnUrl: 'https://example.test/return',
        cancelUrl: 'https://example.test/cancel',
      });
  }

  it(
    'retries a timed-out capture with the same PayPal request ID',
    { timeout: 20_000 },
    async () => {
      const order = await service.create('user', 'address');
      await service.pay(order.id);
      const requestIds: (string | string[] | undefined)[] = [];
      const newAdapter = await startPaypalFixture((request, response) => {
        if (
          request.method === 'GET' &&
          request.url === '/v2/checkout/orders/pp-1'
        ) {
          response.end(JSON.stringify({ id: 'pp-1', status: 'APPROVED' }));
          return;
        }
        if (
          request.method === 'POST' &&
          request.url === '/v2/checkout/orders/pp-1/capture'
        ) {
          requestIds.push(request.headers['paypal-request-id']);
          if (requestIds.length === 1) return; // Leave the connection open until fetch times out.
          response.end(
            JSON.stringify({
              id: 'pp-1',
              status: 'COMPLETED',
              purchase_units: [
                {
                  payments: {
                    captures: [{ id: 'cap-1', status: 'COMPLETED' }],
                  },
                },
              ],
            }),
          );
          return;
        }
        response.writeHead(404).end();
      });

      const worker = await createWorker(newAdapter());
      await expect(worker.capturePayment(order.id)).rejects.toMatchObject({
        name: 'TimeoutError',
      });
      expect(
        await db
          .getRepository(OrderOperationEntity)
          .findOneBy({ id: order.id }),
      ).toMatchObject({ kind: 'capture' });
      expect(
        await db.getRepository(OrderEntity).findOneBy({ id: order.id }),
      ).toMatchObject({ status: OrderStatus.PENDING, captureId: null });
      await expect(worker.cancel(order.id)).rejects.toThrow(
        'Another order operation is pending',
      );

      await (await createWorker(newAdapter())).recoverOperations();
      expect(requestIds[0]).toMatch(/^[0-9a-f]{38}$/);
      expect(requestIds).toEqual([requestIds[0], requestIds[0]]);
      expect(
        await db.getRepository(OrderEntity).findOneBy({ id: order.id }),
      ).toMatchObject({ status: OrderStatus.PAID, captureId: 'cap-1' });
      expect(await db.getRepository(OrderOperationEntity).count()).toBe(0);
    },
  );

  it('recovers a refund accepted by PayPal before the response was lost', async () => {
    const order = await service.create('user', 'address');
    await service.pay(order.id);
    await service.capturePayment(order.id);
    const requestIds: (string | string[] | undefined)[] = [];
    const refunds = new Map<string, { id: string; status: string }>();
    const newAdapter = await startPaypalFixture((request, response) => {
      const key = request.headers['paypal-request-id'];
      if (
        request.method !== 'POST' ||
        request.url !== '/v2/payments/captures/cap-1/refund' ||
        typeof key !== 'string'
      ) {
        response.writeHead(400).end();
        return;
      }
      request.once('end', () => {
        requestIds.push(key);
        if (!refunds.has(key)) {
          refunds.set(key, { id: 'ref-1', status: 'COMPLETED' });
          request.socket.destroy();
          return;
        }
        response.end(JSON.stringify(refunds.get(key)));
      });
      request.resume();
    });

    const worker = await createWorker(newAdapter());
    await expect(worker.cancel(order.id)).rejects.toBeInstanceOf(TypeError);
    expect(refunds.size).toBe(1);
    expect(
      await db.getRepository(OrderOperationEntity).findOneBy({ id: order.id }),
    ).toMatchObject({ kind: 'refund' });
    expect(
      await db.getRepository(OrderEntity).findOneBy({ id: order.id }),
    ).toMatchObject({ status: OrderStatus.PAID });
    expect(await stock()).toBe(3);

    const recoveryWorker = await createWorker(newAdapter());
    await recoveryWorker.recoverOperations();
    expect(
      await db.getRepository(OrderOperationEntity).findOneBy({ id: order.id }),
    ).toMatchObject({ kind: 'release' });
    await recoveryWorker.recoverOperations();
    expect(requestIds[0]).toMatch(/^[0-9a-f]{38}$/);
    expect(requestIds).toEqual([requestIds[0], requestIds[0]]);
    expect(refunds.size).toBe(1);
    expect(
      await db.getRepository(OrderEntity).findOneBy({ id: order.id }),
    ).toMatchObject({ status: OrderStatus.CANCELLED });
    expect(await db.getRepository(OrderOperationEntity).count()).toBe(0);
    expect(await stock()).toBe(5);
  });

  it('blocks shipping during refund and recovers refund and stock in separate steps', async () => {
    const order = await service.create('user', 'address');
    await service.pay(order.id);
    await service.capturePayment(order.id);
    paypal.refundCapture.mockRejectedValueOnce(new Error('response lost'));
    await expect(service.cancel(order.id)).rejects.toThrow('response lost');
    await expect(
      service.updateStatus(order.id, OrderStatus.SHIPPED),
    ).rejects.toThrow('Another order operation is pending');
    unavailable = true;
    await service.recoverOperations();
    expect(
      await db.getRepository(OrderEntity).findOneBy({ id: order.id }),
    ).toMatchObject({ status: OrderStatus.CANCELLED });
    expect(
      await db.getRepository(OrderOperationEntity).findOneBy({ id: order.id }),
    ).toMatchObject({ kind: 'release' });
    await service.recoverOperations();
    expect(await db.getRepository(OrderOperationEntity).count()).toBe(1);
    unavailable = false;
    await db
      .getRepository(OrderOperationEntity)
      .update(order.id, { nextAttemptAt: new Date(0) });
    await service.recoverOperations();
    expect(await stock()).toBe(5);
    expect(await db.getRepository(OrderOperationEntity).count()).toBe(0);
  });

  it('serializes two capture requests across concurrent transactions', async () => {
    const order = await service.create('user', 'address');
    await service.pay(order.id);
    await Promise.all([
      service.capturePayment(order.id),
      service.capturePayment(order.id),
    ]);
    expect(paypal.captureOrder).toHaveBeenCalledTimes(1);
    expect(
      await db.getRepository(OrderEntity).findOneBy({ id: order.id }),
    ).toMatchObject({ status: OrderStatus.PAID });
  });

  it('retains capture work if saving PAID fails after PayPal succeeds', async () => {
    const order = await service.create('user', 'address');
    await service.pay(order.id);
    await db.query(
      `ALTER TABLE orders ADD CONSTRAINT test_no_paid CHECK (status <> 'PAID')`,
    );
    try {
      await expect(service.capturePayment(order.id)).rejects.toThrow(
        'test_no_paid',
      );
      expect(paypal.captureOrder).toHaveBeenCalledTimes(1);
      expect(
        await db.getRepository(OrderEntity).findOneBy({ id: order.id }),
      ).toMatchObject({ status: OrderStatus.PENDING, captureId: null });
      expect(
        await db
          .getRepository(OrderOperationEntity)
          .findOneBy({ id: order.id }),
      ).toMatchObject({ kind: 'capture' });
    } finally {
      await db.query('ALTER TABLE orders DROP CONSTRAINT test_no_paid');
    }
    await service.recoverOperations();
    expect(
      await db.getRepository(OrderEntity).findOneBy({ id: order.id }),
    ).toMatchObject({ status: OrderStatus.PAID, captureId: 'cap-1' });
    expect(await db.getRepository(OrderOperationEntity).count()).toBe(0);
  });

  it('rolls back cancellation when recording its release job fails', async () => {
    const order = await service.create('user', 'address');
    await db.query(
      `ALTER TABLE order_operations ADD CONSTRAINT test_no_release CHECK (kind <> 'release')`,
    );
    try {
      await expect(service.cancel(order.id)).rejects.toThrow('test_no_release');
      expect(
        await db.getRepository(OrderEntity).findOneBy({ id: order.id }),
      ).toMatchObject({ status: OrderStatus.PENDING });
      expect(await stock()).toBe(3);
    } finally {
      await db.query(
        'ALTER TABLE order_operations DROP CONSTRAINT test_no_release',
      );
    }
  });

  afterAll(async () => {
    const results = await Promise.allSettled([
      (async () => {
        try {
          if (db?.isInitialized) await db.destroy();
        } finally {
          await ordersPostgres?.stop();
        }
      })(),
      (async () => {
        try {
          if (productsDb?.isInitialized) await productsDb.destroy();
        } finally {
          await productsPostgres?.stop();
        }
      })(),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
    }
  });
  afterEach(() => vi.restoreAllMocks());
  const stock = async () =>
    (
      await productsDb
        .getRepository(ProductEntity)
        .findOneByOrFail({ id: product.id })
    ).stock;

  const reservation = (id: string) =>
    productsDb.getRepository(StockReservationEntity).findOneByOrFail({ id });

  it('cleans a reserve left behind by a terminated creator, exactly once', async () => {
    const id = randomUUID();
    await db.getRepository(StockIntentEntity).insert({ id });
    await products.reserveStock({
      reservationId: id,
      items: [{ productId: product.id, quantity: 2 }],
    });
    expect(await db.getRepository(OrderEntity).findOneBy({ id })).toBeNull();
    expect(await stock()).toBe(3);
    expect(await reservation(id)).toMatchObject({ status: 'reserved' });

    const recoveredWorker = await createWorker();
    await recoveredWorker.recoverStock();
    expect(await stock()).toBe(5);
    expect(await reservation(id)).toMatchObject({ status: 'released' });
    expect(await db.getRepository(StockIntentEntity).count()).toBe(0);
    await recoveredWorker.recoverStock();
    expect(await stock()).toBe(5);
    expect(await productsDb.getRepository(StockReservationEntity).count()).toBe(
      1,
    );
    expect(await reservation(id)).toMatchObject({ status: 'released' });
  });
  it('keeps durable work when Products is unavailable and retries later', async () => {
    loseReserveResponse = true;
    unavailable = true;
    await expect(service.create('user', 'Address')).rejects.toThrow(
      'response lost',
    );
    expect(await stock()).toBe(3);
    expect(await db.getRepository(StockIntentEntity).count()).toBe(1);
    const recoveredWorker = await createWorker();
    await recoveredWorker.recoverStock();
    expect(await db.getRepository(StockIntentEntity).count()).toBe(1);
    expect(await stock()).toBe(3);
    unavailable = false;
    await recoveredWorker.recoverStock();
    expect(await stock()).toBe(5);
    expect(await db.getRepository(StockIntentEntity).count()).toBe(0);
  });
  it('compensates a failed order save', async () => {
    vi.spyOn(Repository.prototype, 'save').mockRejectedValueOnce(
      new Error('save failed'),
    );
    await expect(service.create('user', 'Address')).rejects.toThrow(
      'save failed',
    );
    expect(await stock()).toBe(5);
    expect(await db.getRepository(OrderEntity).count()).toBe(0);
    expect(await db.getRepository(StockIntentEntity).count()).toBe(0);
  });
  it('does not release stock for a committed order, even with a leftover intent', async () => {
    const order = await service.create('user', 'Address');
    expect(await db.getRepository(StockIntentEntity).count()).toBe(0);
    await db.getRepository(StockIntentEntity).insert({ id: order.id });
    await service.recoverStock();
    expect(await stock()).toBe(3);
    expect(await db.getRepository(StockIntentEntity).count()).toBe(0);
  });
  it('skips a creator holding the intent lock', async () => {
    const id = randomUUID();
    await db.getRepository(StockIntentEntity).insert({ id });
    await products.reserveStock({
      reservationId: id,
      items: [{ productId: product.id, quantity: 2 }],
    });
    const runner = db.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.manager.getRepository(StockIntentEntity).findOneOrFail({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      await service.recoverStock();
      expect(await stock()).toBe(3);
      expect(await db.getRepository(StockIntentEntity).count()).toBe(1);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
    await service.recoverStock();
    expect(await stock()).toBe(5);
  });
  it('allows multiple recovery workers without duplicate restocking', async () => {
    const id = randomUUID();
    await db.getRepository(StockIntentEntity).insert({ id });
    await products.reserveStock({
      reservationId: id,
      items: [{ productId: product.id, quantity: 2 }],
    });
    const secondWorker = await createWorker();
    await Promise.all([service.recoverStock(), secondWorker.recoverStock()]);
    expect(await stock()).toBe(5);
  });
});
