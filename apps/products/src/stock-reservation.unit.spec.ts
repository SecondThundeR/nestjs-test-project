import type { EntityManager, Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { createInMemoryCache } from '../../../test/utils/in-memory-cache.js';
import { ProductEntity } from './entities/product.entity.js';
import { StockReservationEntity } from './entities/stock-reservation.entity.js';
import { ProductsService } from './products.service.js';

const items = [
  { productId: 'b', quantity: 2 },
  { productId: 'a', quantity: 1 },
];
const dto = { reservationId: 'order', items };
const sortedItems = items.toReversed();

function setup(
  status: StockReservationEntity['status'],
  reservedItems = sortedItems,
) {
  const insert = {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    orIgnore: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
  };
  const update = {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ affected: 1 }),
  };
  const reservations = {
    createQueryBuilder: vi.fn(() => insert),
    findOneOrFail: vi.fn().mockResolvedValue({
      id: dto.reservationId,
      status,
      items: reservedItems,
    }),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const products = {
    createQueryBuilder: vi.fn(() => update),
    increment: vi.fn().mockResolvedValue(undefined),
  };
  const manager = {
    getRepository: (
      entity: typeof StockReservationEntity | typeof ProductEntity,
    ) => (entity === StockReservationEntity ? reservations : products),
  };
  const repository = {
    manager: {
      transaction: (run: (manager: EntityManager) => unknown) =>
        run(manager as unknown as EntityManager),
    },
  };
  const { service: cache, store } = createInMemoryCache();
  const service = new ProductsService(
    repository as unknown as Repository<ProductEntity>,
    cache,
  );
  return { service, insert, update, reservations, products, store };
}

describe('stock reservation decisions', () => {
  it('debits products in stable order, records the reserve and invalidates the cached stock', async () => {
    const { service, insert, update, reservations, store } = setup('pending');
    store.set('product:a', { stock: 3 });

    await expect(service.reserveStock(dto)).resolves.toEqual({ success: true });
    expect(insert.values).toHaveBeenCalledWith({
      id: 'order',
      items: sortedItems,
      status: 'pending',
    });
    expect(update.where.mock.calls.map(([, params]) => params)).toEqual([
      { id: 'a', quantity: 1 },
      { id: 'b', quantity: 2 },
    ]);
    const patch = update.set.mock.calls[0][0] as { stock: () => string };
    expect(patch.stock()).toBe('"stock" - :quantity');
    expect(reservations.update).toHaveBeenCalledWith('order', {
      status: 'reserved',
    });
    expect(store.has('product:a')).toBe(false);
  });

  it('returns success for the same reserve without debiting twice', async () => {
    const { service, update, reservations } = setup('reserved');
    await expect(service.reserveStock(dto)).resolves.toEqual({ success: true });
    expect(update.execute).not.toHaveBeenCalled();
    expect(reservations.update).not.toHaveBeenCalled();
  });

  it.each([
    ['released', sortedItems],
    ['reserved', [sortedItems[0]]],
    [
      'reserved',
      [{ ...sortedItems[0], productId: 'different' }, sortedItems[1]],
    ],
    ['reserved', [{ ...sortedItems[0], quantity: 3 }, sortedItems[1]]],
  ] as const)(
    'rejects an incompatible reservation with state %s and items %j',
    async (status, saved) => {
      const { service, update } = setup(status, [...saved]);
      await expect(service.reserveStock(dto)).rejects.toThrow(
        'Reservation was released or has different items',
      );
      expect(update.execute).not.toHaveBeenCalled();
    },
  );

  it('aborts the reserve when a debit updates no row', async () => {
    const { service, update, reservations } = setup('pending');
    update.execute.mockResolvedValueOnce({ affected: 0 });
    await expect(service.reserveStock(dto)).rejects.toThrow(
      'has insufficient stock',
    );
    expect(reservations.update).not.toHaveBeenCalled();
  });

  it('records a tombstone for a missing reservation and does not restock an already released reserve', async () => {
    const { service, insert, products } = setup('released', []);
    await service.releaseStock({ reservationId: 'order' });
    expect(insert.values).toHaveBeenCalledWith({
      id: 'order',
      items: [],
      status: 'released',
    });
    expect(products.increment).not.toHaveBeenCalled();
  });

  it('uses legacy items when the reservation record is missing', async () => {
    const { service, insert, products, reservations } = setup(
      'reserved',
      items,
    );
    await service.releaseStock({ reservationId: 'order', legacyItems: items });
    expect(insert.values).toHaveBeenCalledWith({
      id: 'order',
      status: 'reserved',
      items,
    });
    expect(products.increment.mock.calls).toEqual([
      [{ id: 'a' }, 'stock', 1],
      [{ id: 'b' }, 'stock', 2],
    ]);
    expect(reservations.update).toHaveBeenCalledWith('order', {
      status: 'released',
    });
  });
});
