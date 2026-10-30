import { randomUUID } from 'node:crypto';
import { CacheService } from '@app/cache';
import { SERVICE_NAMES } from '@app/config';
import {
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
    beforeAll(async () => {
      db = new DataSource({
        type: 'postgres',
        url: process.env.RECOVERY_TEST_DATABASE_URL,
        entities: [
          OrderEntity,
          StockIntentEntity,
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
        'TRUNCATE orders, stock_intents, products, stock_reservations',
      );
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
          { provide: PaypalService, useValue: {} },
        ],
      }).compile();
      service = module.get(OrdersService);
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
