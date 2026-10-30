import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createInMemoryCache } from '../../../test/utils/in-memory-cache.js';
import { ProductEntity } from '../src/entities/product.entity.js';
import { StockReservationEntity } from '../src/entities/stock-reservation.entity.js';
import { productsMigrations } from '../src/migrations/index.js';
import { ProductsService } from '../src/products.service.js';

// Use a dedicated empty PostgreSQL database: this suite truncates its tables.
describe.skipIf(!process.env.STOCK_TEST_DATABASE_URL)(
  'Stock reservations (PostgreSQL)',
  () => {
    let db: DataSource;
    let service: ProductsService;
    let cacheStore: Map<string, unknown>;
    beforeAll(async () => {
      db = new DataSource({
        type: 'postgres',
        url: process.env.STOCK_TEST_DATABASE_URL,
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
      if (db?.isInitialized) await db.destroy();
    });

    it('allows only one of two competing purchases when stock is insufficient', async () => {
      const product = await service.create({
        name: 'Widget',
        price: 10,
        stock: 5,
      });
      const items = [{ productId: product.id, quantity: 4 }];
      const outcomes = await Promise.allSettled([
        service.reserveStock({ reservationId: randomUUID(), items }),
        service.reserveStock({ reservationId: randomUUID(), items }),
      ]);
      expect(
        outcomes.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        (
          await db
            .getRepository(ProductEntity)
            .findOneByOrFail({ id: product.id })
        ).stock,
      ).toBe(1);
    });

    it('rolls back the entire batch if a later item has insufficient stock', async () => {
      const a = await service.create({ name: 'First', price: 10, stock: 5 });
      const b = await service.create({ name: 'Second', price: 10, stock: 0 });
      const sorted = [a, b].sort((x, y) => x.id.localeCompare(y.id));
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
  },
);
