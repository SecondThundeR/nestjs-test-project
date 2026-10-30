import { OrderOperationEntity } from '../src/entities/order-operation.entity.js';
import { randomUUID } from 'node:crypto';
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
import { createInMemoryCache } from '../../../test/utils/in-memory-cache.js';
import { ProductEntity } from '../../products/src/entities/product.entity.js';
import { StockReservationEntity } from '../../products/src/entities/stock-reservation.entity.js';
import { productsMigrations } from '../../products/src/migrations/index.js';
import { ProductsService } from '../../products/src/products.service.js';
import { OrderEntity } from '../src/entities/order.entity.js';
import { StockIntentEntity } from '../src/entities/stock-intent.entity.js';
import { ordersMigrations } from '../src/migrations/index.js';
import { OrdersService } from '../src/orders.service.js';
import { PaypalService } from '../src/paypal/paypal.service.js';

// Dedicated empty PostgreSQL database only: the suite truncates these tables.
describe.skipIf(!process.env.RECOVERY_TEST_DATABASE_URL)(
  'Stock recovery (PostgreSQL)',
  () => {
    let db: DataSource;
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
      db = new DataSource({
        type: 'postgres',
        url: process.env.RECOVERY_TEST_DATABASE_URL,
        entities: [
          OrderEntity,
          StockIntentEntity,
          OrderOperationEntity,
          ProductEntity,
          StockReservationEntity,
        ],
        migrations: [
          ...Object.values(productsMigrations),
          ...Object.values(ordersMigrations),
        ],
      });
      await db.initialize();
      await db.runMigrations();
    });
    beforeEach(async () => {
      await db.query(
        'TRUNCATE order_operations, orders, stock_intents, products, stock_reservations',
      );
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
        db.getRepository(ProductEntity),
        createInMemoryCache().service,
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
      const module = await Test.createTestingModule({
        providers: [
          OrdersService,
          {
            provide: getRepositoryToken(OrderEntity),
            useValue: db.getRepository(OrderEntity),
          },
          { provide: CacheService, useValue: createInMemoryCache().service },
          { provide: SERVICE_NAMES.PRODUCTS, useValue: { send } },
          {
            provide: SERVICE_NAMES.CART,
            useValue: {
              send: () =>
                of({ items: [{ productId: product.id, quantity: 2 }] }),
            },
          },
          { provide: PaypalService, useValue: paypal },
        ],
      }).compile();
      service = module.get(OrdersService);
    });
    it('retains capture work after a lost response and completes it on recovery', async () => {
      const order = await service.create('user', 'address');
      await service.pay(order.id);
      paypal.captureOrder.mockRejectedValueOnce(new Error('response lost'));
      await expect(service.capturePayment(order.id)).rejects.toThrow(
        'response lost',
      );
      expect(
        await db
          .getRepository(OrderOperationEntity)
          .findOneBy({ id: order.id }),
      ).toMatchObject({ kind: 'capture' });
      await expect(service.cancel(order.id)).rejects.toThrow();
      await service.recoverOperations();
      expect(
        await db.getRepository(OrderEntity).findOneBy({ id: order.id }),
      ).toMatchObject({ status: OrderStatus.PAID, captureId: 'cap-1' });
      expect(await db.getRepository(OrderOperationEntity).count()).toBe(0);
    });

    it('blocks shipping during refund and recovers refund and stock in separate steps', async () => {
      const order = await service.create('user', 'address');
      await service.pay(order.id);
      await service.capturePayment(order.id);
      paypal.refundCapture.mockRejectedValueOnce(new Error('response lost'));
      await expect(service.cancel(order.id)).rejects.toThrow('response lost');
      await expect(
        service.updateStatus(order.id, OrderStatus.SHIPPED),
      ).rejects.toThrow();
      unavailable = true;
      await service.recoverOperations();
      expect(
        await db.getRepository(OrderEntity).findOneBy({ id: order.id }),
      ).toMatchObject({ status: OrderStatus.CANCELLED });
      expect(
        await db
          .getRepository(OrderOperationEntity)
          .findOneBy({ id: order.id }),
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
        await expect(service.capturePayment(order.id)).rejects.toThrow();
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
        await expect(service.cancel(order.id)).rejects.toThrow();
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
      if (db?.isInitialized) await db.destroy();
    });
    afterEach(() => vi.restoreAllMocks());
    const stock = async () =>
      (
        await db
          .getRepository(ProductEntity)
          .findOneByOrFail({ id: product.id })
      ).stock;

    it('cleans a reserve left behind by a terminated creator, exactly once', async () => {
      const id = randomUUID();
      await db.getRepository(StockIntentEntity).insert({ id });
      await products.reserveStock({
        reservationId: id,
        items: [{ productId: product.id, quantity: 2 }],
      });
      await service.recoverStock();
      await service.recoverStock();
      expect(await stock()).toBe(5);
      expect(await db.getRepository(StockIntentEntity).count()).toBe(0);
    });
    it('keeps durable work when Products is unavailable and retries later', async () => {
      loseReserveResponse = true;
      unavailable = true;
      await expect(service.create('user', 'Address')).rejects.toThrow(
        'response lost',
      );
      expect(await stock()).toBe(3);
      expect(await db.getRepository(StockIntentEntity).count()).toBe(1);
      await service.recoverStock();
      expect(await db.getRepository(StockIntentEntity).count()).toBe(1);
      unavailable = false;
      await service.recoverStock();
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
      await Promise.all([service.recoverStock(), service.recoverStock()]);
      expect(await stock()).toBe(5);
    });
  },
);
