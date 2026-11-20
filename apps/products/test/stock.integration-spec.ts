import { randomUUID } from 'node:crypto';
import { RpcException } from '@nestjs/microservices';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { startTestPostgres } from '../../../test/utils/postgresql.js';
import { createInMemoryCache } from '../../../test/utils/in-memory-cache.js';
import { ProductEntity } from '../src/entities/product.entity.js';
import { StockReservationEntity } from '../src/entities/stock-reservation.entity.js';
import { productsMigrations } from '../src/migrations/index.js';
import { ProductsService } from '../src/products.service.js';

describe('Stock reservations (PostgreSQL)', () => {
  let postgres: StartedPostgreSqlContainer | undefined;
  let db: DataSource;
  let service: ProductsService;
  let cacheStore: Map<string, unknown>;
  beforeAll(async () => {
    postgres = await startTestPostgres('products');
    db = new DataSource({
      type: 'postgres',
      url: postgres.getConnectionUri(),
      synchronize: false,
      entities: [ProductEntity, StockReservationEntity],
      migrations: productsMigrations,
    });
    await db.initialize();
    await db.runMigrations();
  });
  beforeEach(async () => {
    await db.query('TRUNCATE products, stock_reservations');
    const cache = createInMemoryCache();
    cacheStore = cache.store;
    service = new ProductsService(
      db.getRepository(ProductEntity),
      cache.service,
    );
  });
  afterAll(async () => {
    try {
      if (db?.isInitialized) await db.destroy();
    } finally {
      await postgres?.stop();
    }
  });

  it(
    'reserves the last unit for exactly one of two competing orders',
    { timeout: 15_000 },
    async () => {
      const product = await service.create({
        name: 'Widget',
        price: 10,
        stock: 1,
      });
      const items = [{ productId: product.id, quantity: 1 }];
      let attempts = Promise.resolve<PromiseSettledResult<string>[]>([]);
      let outcomes: PromiseSettledResult<string>[];
      try {
        await db.transaction(async (manager) => {
          // Hold the last unit until both reservations actually contend in PostgreSQL.
          await manager.findOneOrFail(ProductEntity, {
            where: { id: product.id },
            lock: { mode: 'pessimistic_write' },
          });
          attempts = Promise.allSettled(
            [randomUUID(), randomUUID()].map(async (reservationId) => {
              await service.reserveStock({ reservationId, items });
              return reservationId;
            }),
          );
          await expect
            .poll(
              async () => {
                const [row] = await db.query<{ waiting: number }[]>(`
                  SELECT count(*)::int AS waiting FROM pg_stat_activity
                  WHERE datname = current_database() AND wait_event_type = 'Lock'
                `);
                return row.waiting;
              },
              { timeout: 5_000 },
            )
            .toBe(2);
        });
      } finally {
        // Drain both transactions even if the contention assertion fails.
        outcomes = await attempts;
      }
      const winner = outcomes.find((result) => result.status === 'fulfilled');
      const refusal: unknown = outcomes.find(
        (result) => result.status === 'rejected',
      )?.reason;
      expect(winner).toBeDefined();
      expect(
        refusal instanceof RpcException && refusal.getError(),
      ).toMatchObject({
        statusCode: 400,
        message: `Product ${product.id} is unavailable or has insufficient stock`,
      });
      expect(
        await db
          .getRepository(ProductEntity)
          .findOneByOrFail({ id: product.id }),
      ).toMatchObject({ stock: 0 });
      expect(await db.getRepository(StockReservationEntity).find()).toEqual([
        expect.objectContaining({
          id: winner?.value,
          items,
          status: 'reserved',
        }),
      ]);
    },
  );

  it('rolls back the entire batch if a later item has insufficient stock', async () => {
    const a = await service.create({ name: 'First', price: 10, stock: 5 });
    const b = await service.create({ name: 'Second', price: 10, stock: 0 });
    const sorted = [a, b].toSorted((x, y) => x.id.localeCompare(y.id));
    await db.getRepository(ProductEntity).update(sorted[0].id, { stock: 5 });
    await db.getRepository(ProductEntity).update(sorted[1].id, { stock: 0 });
    await expect(
      service.reserveStock({
        reservationId: randomUUID(),
        items: sorted.map((p) => ({ productId: p.id, quantity: 1 })),
      }),
    ).rejects.toThrow();
    expect(
      (
        await db
          .getRepository(ProductEntity)
          .findOneByOrFail({ id: sorted[0].id })
      ).stock,
    ).toBe(5);
    expect(await db.getRepository(StockReservationEntity).count()).toBe(0);
  });

  it('deduplicates concurrent reserve and release requests', async () => {
    const p = await service.create({ name: 'Widget', price: 10, stock: 5 });
    const dto = {
      reservationId: randomUUID(),
      items: [{ productId: p.id, quantity: 2 }],
    };
    await Promise.all([service.reserveStock(dto), service.reserveStock(dto)]);
    expect((await service.findOne(p.id)).stock).toBe(3);
    await Promise.all([
      service.releaseStock({ reservationId: dto.reservationId }),
      service.releaseStock({ reservationId: dto.reservationId }),
    ]);
    expect((await service.findOne(p.id)).stock).toBe(5);
    await expect(service.reserveStock(dto)).rejects.toThrow();
  });

  it('prevents a late reserve after compensation created a tombstone', async () => {
    const p = await service.create({ name: 'Widget', price: 10, stock: 5 });
    const reservationId = randomUUID();
    await service.releaseStock({ reservationId });
    await expect(
      service.reserveStock({
        reservationId,
        items: [{ productId: p.id, quantity: 2 }],
      }),
    ).rejects.toThrow();
    expect((await service.findOne(p.id)).stock).toBe(5);
  });

  it('restores a legacy order exactly once', async () => {
    const p = await service.create({ name: 'Widget', price: 10, stock: 3 });
    const dto = {
      reservationId: randomUUID(),
      legacyItems: [{ productId: p.id, quantity: 2 }],
    };
    await Promise.all([service.releaseStock(dto), service.releaseStock(dto)]);
    expect((await service.findOne(p.id)).stock).toBe(5);
  });

  it('does not overwrite a reservation when updating a cached product', async () => {
    const p = await service.create({ name: 'Widget', price: 10, stock: 5 });
    await service.findOne(p.id);
    await service.reserveStock({
      reservationId: randomUUID(),
      items: [{ productId: p.id, quantity: 2 }],
    });
    cacheStore.set(`product:${p.id}`, p);
    await service.update(p.id, { name: 'Updated' });
    expect((await service.findOne(p.id)).stock).toBe(3);
  });

  it('serializes a reserve racing its compensation', async () => {
    const p = await service.create({ name: 'Widget', price: 10, stock: 5 });
    const reservationId = randomUUID();
    await Promise.allSettled([
      service.reserveStock({
        reservationId,
        items: [{ productId: p.id, quantity: 2 }],
      }),
      service.releaseStock({ reservationId }),
    ]);
    expect(
      (await db.getRepository(ProductEntity).findOneByOrFail({ id: p.id }))
        .stock,
    ).toBe(5);
    expect(
      (
        await db
          .getRepository(StockReservationEntity)
          .findOneByOrFail({ id: reservationId })
      ).status,
    ).toBe('released');
  });

  it('rejects reuse of a reservation ID with different quantities', async () => {
    const p = await service.create({ name: 'Widget', price: 10, stock: 5 });
    const reservationId = randomUUID();
    await service.reserveStock({
      reservationId,
      items: [{ productId: p.id, quantity: 2 }],
    });
    await expect(
      service.reserveStock({
        reservationId,
        items: [{ productId: p.id, quantity: 3 }],
      }),
    ).rejects.toThrow();
    expect((await service.findOne(p.id)).stock).toBe(3);
  });
});
