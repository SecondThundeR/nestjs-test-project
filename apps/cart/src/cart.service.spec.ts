import { SERVICE_NAMES } from '@app/config';
import { cartSchema, type Product, PRODUCT_PATTERNS } from '@app/domains';
import { RpcException, type ClientProxy } from '@nestjs/microservices';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { of, throwError } from 'rxjs';
import type { Mock } from 'vitest';

import { createTestMongo } from '../../../test/utils/mongodb.js';
import { CartEventsPublisher } from './cart-events.publisher.js';
import { CartService } from './cart.service.js';
import { CartStore } from './cart.store.js';
import { cartDatabaseOptions } from './cart.database.js';
import { CartSchema } from './schemas/cart.schema.js';

const USER = 'user-1';

function makeProduct(overrides: Partial<Product> = {}): Product {
  const now = new Date().toISOString();
  return {
    id: 'p-1',
    name: 'Widget',
    description: '',
    price: 9.99,
    stock: 100,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('CartService', () => {
  let service: CartService;
  let moduleRef: TestingModule;
  const events = { updated: vi.fn() };
  let productsClient: { send: Mock };
  let mongo: MongoMemoryServer;
  let store: CartStore;
  let database = 0;
  let dataSource: DataSource;

  beforeAll(async () => {
    mongo = await createTestMongo();
  }, 120000);
  afterAll(async () => {
    await mongo.stop();
  });

  beforeEach(async () => {
    events.updated.mockClear();
    productsClient = { send: vi.fn() };
    dataSource = await new DataSource(
      cartDatabaseOptions(mongo.getUri(`cart_${database++}`)),
    ).initialize();

    moduleRef = await Test.createTestingModule({
      providers: [
        CartService,
        CartStore,
        { provide: CartEventsPublisher, useValue: events },
        {
          provide: getRepositoryToken(CartSchema),
          useValue: dataSource.getMongoRepository(CartSchema),
        },
        { provide: SERVICE_NAMES.PRODUCTS, useValue: productsClient },
      ],
    }).compile();

    service = moduleRef.get(CartService);
    store = moduleRef.get(CartStore);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('publishes after all successful mutation paths, including clearing', async () => {
    productsClient.send.mockReturnValue(of(makeProduct()));
    await service.addItem(USER, { productId: 'p-1', quantity: 2 });
    await service.updateItem(USER, 'p-1', 3);
    await service.removeItem(USER, 'p-1');
    await service.clear(USER);
    expect(events.updated).toHaveBeenCalledTimes(4);
    expect(events.updated).toHaveBeenLastCalledWith(USER);
  });

  it('does not publish when persistence fails', async () => {
    vi.spyOn(store, 'mutate').mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await expect(service.clear(USER)).rejects.toThrow('database unavailable');
    expect(events.updated).not.toHaveBeenCalled();
  });

  it('preserves simultaneous first additions from independent service instances', async () => {
    productsClient.send.mockReturnValue(of(makeProduct()));
    const secondDataSource = await new DataSource(
      cartDatabaseOptions(mongo.getUri(`cart_${database - 1}`)),
    ).initialize();
    const secondStore = new CartStore(
      secondDataSource.getMongoRepository(CartSchema),
    );
    try {
      const second = new CartService(
        secondStore,
        moduleRef.get<ClientProxy>(SERVICE_NAMES.PRODUCTS),
        moduleRef.get(CartEventsPublisher),
      );
      await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          (index % 2 ? second : service).addItem(USER, {
            productId: 'p-1',
            quantity: 1,
          }),
        ),
      );
      const cart = await service.get(USER);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(12);
      expect(cart.total).toBe(119.88);
      expect(Object.keys(cart).sort()).toEqual([
        'items',
        'total',
        'updatedAt',
        'userId',
      ]);
      expect(events.updated).toHaveBeenCalledTimes(12);
    } finally {
      await secondDataSource.destroy();
    }
  });

  it('rechecks stock after competing writes and publishes only successful updates', async () => {
    productsClient.send.mockReturnValue(of(makeProduct({ stock: 3 })));
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        service.addItem(USER, { productId: 'p-1', quantity: 1 }),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(3);
    const cart = await service.get(USER);
    expect(cart.items[0].quantity).toBe(3);
    expect(events.updated).toHaveBeenCalledTimes(3);
  });

  describe('get', () => {
    it('returns an empty cart for an unknown user', async () => {
      const cart = await service.get(USER);

      expect(cart).toMatchObject({ userId: USER, items: [], total: 0 });
      expect(typeof cart.updatedAt).toBe('string');
    });

    it('returns the stored cart after items have been added', async () => {
      productsClient.send.mockReturnValue(of(makeProduct()));
      const added = await service.addItem(USER, {
        productId: 'p-1',
        quantity: 1,
      });

      await expect(service.get(USER)).resolves.toStrictEqual(added);
    });
  });

  describe('addItem', () => {
    it('fetches the product via the products client FIND_ONE pattern', async () => {
      productsClient.send.mockReturnValue(of(makeProduct()));

      await service.addItem(USER, { productId: 'p-1', quantity: 1 });

      expect(productsClient.send).toHaveBeenCalledWith(
        PRODUCT_PATTERNS.FIND_ONE,
        'p-1',
      );
    });

    it('adds a new line item and computes subtotal and total', async () => {
      productsClient.send.mockReturnValue(of(makeProduct({ price: 10 })));

      const cart = await service.addItem(USER, {
        productId: 'p-1',
        quantity: 3,
      });

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]).toMatchObject({
        productId: 'p-1',
        name: 'Widget',
        price: 10,
        quantity: 3,
        subtotal: 30,
      });
      expect(cart.total).toBe(30);
    });

    it('increments quantity and refreshes price/name for an existing item', async () => {
      productsClient.send.mockReturnValue(of(makeProduct({ price: 10 })));
      await service.addItem(USER, { productId: 'p-1', quantity: 2 });

      productsClient.send.mockReturnValue(
        of(makeProduct({ price: 12, name: 'Widget Pro' })),
      );
      const cart = await service.addItem(USER, {
        productId: 'p-1',
        quantity: 1,
      });

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]).toMatchObject({
        quantity: 3,
        price: 12,
        name: 'Widget Pro',
        subtotal: 36,
      });
      expect(cart.total).toBe(36);
    });

    it('rounds subtotal and total to two decimal places', async () => {
      productsClient.send.mockReturnValue(of(makeProduct({ price: 0.1 })));

      const cart = await service.addItem(USER, {
        productId: 'p-1',
        quantity: 3,
      });

      expect(cart.items[0].subtotal).toBe(0.3);
      expect(cart.total).toBe(0.3);
    });

    it('throws RpcException when stock is insufficient', async () => {
      productsClient.send.mockReturnValue(of(makeProduct({ stock: 2 })));

      await expect(
        service.addItem(USER, { productId: 'p-1', quantity: 5 }),
      ).rejects.toBeInstanceOf(RpcException);
    });

    it('accounts for existing quantity when checking stock', async () => {
      productsClient.send.mockReturnValue(of(makeProduct({ stock: 3 })));
      await service.addItem(USER, { productId: 'p-1', quantity: 2 });

      await expect(
        service.addItem(USER, { productId: 'p-1', quantity: 2 }),
      ).rejects.toBeInstanceOf(RpcException);
    });

    it('throws RpcException when the product does not exist', async () => {
      productsClient.send.mockReturnValue(of(null));

      await expect(
        service.addItem(USER, { productId: 'missing', quantity: 1 }),
      ).rejects.toBeInstanceOf(RpcException);
    });

    it('throws RpcException when the products client errors', async () => {
      productsClient.send.mockReturnValue(throwError(() => new Error('down')));

      await expect(
        service.addItem(USER, { productId: 'p-1', quantity: 1 }),
      ).rejects.toBeInstanceOf(RpcException);
    });
  });

  describe('updateItem', () => {
    beforeEach(async () => {
      productsClient.send.mockReturnValue(of(makeProduct({ price: 10 })));
      await service.addItem(USER, { productId: 'p-1', quantity: 2 });
      productsClient.send.mockClear();
    });

    it('updates quantity and price and recalculates totals', async () => {
      productsClient.send.mockReturnValue(of(makeProduct({ price: 11 })));

      const cart = await service.updateItem(USER, 'p-1', 4);

      expect(cart.items[0]).toMatchObject({
        quantity: 4,
        price: 11,
        subtotal: 44,
      });
      expect(cart.total).toBe(44);
    });

    it('throws RpcException when the cart does not exist', async () => {
      await expect(
        service.updateItem('nobody', 'p-1', 1),
      ).rejects.toBeInstanceOf(RpcException);
    });

    it('throws RpcException when the item is not in the cart', async () => {
      await expect(
        service.updateItem(USER, 'other-product', 1),
      ).rejects.toBeInstanceOf(RpcException);
    });

    it('throws RpcException when stock is insufficient', async () => {
      productsClient.send.mockReturnValue(of(makeProduct({ stock: 1 })));

      await expect(service.updateItem(USER, 'p-1', 5)).rejects.toBeInstanceOf(
        RpcException,
      );
    });

    it('removes the item when quantity is 0', async () => {
      const cart = await service.updateItem(USER, 'p-1', 0);

      expect(cart.items).toHaveLength(0);
      expect(cart.total).toBe(0);
      expect(productsClient.send).not.toHaveBeenCalled();
    });
  });

  describe('removeItem', () => {
    beforeEach(async () => {
      productsClient.send.mockReturnValue(
        of(makeProduct({ id: 'p-1', price: 10 })),
      );
      await service.addItem(USER, { productId: 'p-1', quantity: 1 });
      productsClient.send.mockReturnValue(
        of(makeProduct({ id: 'p-2', name: 'Gadget', price: 5 })),
      );
      await service.addItem(USER, { productId: 'p-2', quantity: 1 });
    });

    it('removes only the targeted item and keeps the rest', async () => {
      const cart = await service.removeItem(USER, 'p-1');

      expect(cart.items.map((item) => item.productId)).toEqual(['p-2']);
      expect(cart.total).toBe(5);
    });

    it('throws RpcException when the cart does not exist', async () => {
      await expect(service.removeItem('nobody', 'p-1')).rejects.toThrow(
        RpcException,
      );
    });
  });

  describe('clear', () => {
    it('creates and persists an empty cart when none exists', async () => {
      const cart = await service.clear(USER);

      expect(cart).toMatchObject({ userId: USER, items: [], total: 0 });
      expect(cartSchema.safeParse(cart).success).toBe(true);
      await expect(service.get(USER)).resolves.toStrictEqual(cart);
    });

    it('returns a valid cart after two consecutive clears', async () => {
      const first = await service.clear(USER);
      const second = await service.clear(USER);

      expect(cartSchema.safeParse(first).success).toBe(true);
      expect(cartSchema.safeParse(second).success).toBe(true);
      expect(second).toMatchObject({ userId: USER, items: [], total: 0 });
      await expect(service.get(USER)).resolves.toStrictEqual(second);
    });

    it('returns a valid cart when clearing after the last item is removed', async () => {
      productsClient.send.mockReturnValue(of(makeProduct()));
      await service.addItem(USER, { productId: 'p-1', quantity: 1 });
      await service.removeItem(USER, 'p-1');

      const cart = await service.clear(USER);

      expect(cartSchema.safeParse(cart).success).toBe(true);
      expect(cart).toMatchObject({ userId: USER, items: [], total: 0 });
      await expect(service.get(USER)).resolves.toStrictEqual(cart);
    });

    it('empties an existing cart', async () => {
      productsClient.send.mockReturnValue(of(makeProduct()));
      await service.addItem(USER, { productId: 'p-1', quantity: 1 });

      const cart = await service.clear(USER);

      expect(cart.items).toHaveLength(0);
      expect(cart.total).toBe(0);
      expect((await service.get(USER)).items).toHaveLength(0);
    });
  });
});
