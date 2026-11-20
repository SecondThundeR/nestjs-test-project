import { MongoServerError } from 'mongodb';
import type { MongoRepository } from 'typeorm';
import { expect, it, vi } from 'vitest';
import { cartDatabaseOptions } from './cart.database.js';
import { CartStore } from './cart.store.js';
import type { CartDocument } from './schemas/cart.schema.js';

const document: CartDocument = {
  _id: 'buyer',
  userId: 'buyer',
  version: 1,
  items: [],
  total: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function setup() {
  const repository = {
    findOne: vi.fn().mockResolvedValue(document),
    insertOne: vi.fn(),
    replaceOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
  };
  const store = new CartStore(
    repository as unknown as MongoRepository<CartDocument>,
  );
  return { store, repository };
}

it('uses the local MongoDB default and accepts an explicit URI', () => {
  expect(cartDatabaseOptions()).toMatchObject({
    type: 'mongodb',
    url: 'mongodb://127.0.0.1:27017/cart',
  });
  expect(cartDatabaseOptions('mongodb://mongo:27017/other')).toMatchObject({
    url: 'mongodb://mongo:27017/other',
    synchronize: false,
    migrationsRun: false,
  });
});

it('re-reads the cart after another writer inserts it first', async () => {
  const { store, repository } = setup();
  repository.findOne.mockResolvedValueOnce(null);
  repository.insertOne.mockRejectedValueOnce(
    new MongoServerError({ code: 11000, message: 'duplicate key' }),
  );
  const changed = await store.mutate('buyer', true, (cart) => {
    cart.total = 10;
  });
  expect(changed).toMatchObject({ userId: 'buyer', total: 10 });
  expect(changed).not.toHaveProperty('version');
  expect(repository.replaceOne).toHaveBeenCalledWith(
    { _id: 'buyer', version: 1 },
    expect.objectContaining({ version: 2, total: 10 }),
  );
});

it.each([
  new Error('database unavailable'),
  new MongoServerError({ code: 121, message: 'document rejected' }),
])(
  'propagates writes that fail for reasons other than a duplicate ID',
  async (error) => {
    const { store, repository } = setup();
    repository.findOne.mockResolvedValueOnce(null);
    repository.insertOne.mockRejectedValueOnce(error);
    await expect(store.mutate('buyer', true, () => {})).rejects.toBe(error);
    expect(repository.findOne).toHaveBeenCalledOnce();
  },
);

it('returns a conflict after repeated version mismatches instead of overwriting', async () => {
  const { store, repository } = setup();
  repository.replaceOne.mockResolvedValue({ matchedCount: 0 });
  await expect(store.mutate('buyer', false, () => {})).rejects.toThrow(
    'Cart was updated concurrently; retry the request',
  );
  expect(repository.findOne).toHaveBeenCalledTimes(64);
  expect(repository.insertOne).not.toHaveBeenCalled();
});
