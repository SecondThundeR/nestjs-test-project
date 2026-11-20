import { randomUUID } from 'node:crypto';
import { SERVICE_NAMES } from '@app/config';
import { PRODUCT_PATTERNS } from '@app/domains';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { of } from 'rxjs';
import type { StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { onTestFinished } from 'vitest';
import { startTestMongo } from '../../../test/utils/mongodb.js';
import { CartEventsPublisher } from '../src/cart-events.publisher.js';
import { cartDatabaseOptions } from '../src/cart.database.js';
import { CartService } from '../src/cart.service.js';
import { CartStore } from '../src/cart.store.js';
import { CartSchema, type CartDocument } from '../src/schemas/cart.schema.js';

describe('Concurrent cart updates (MongoDB)', () => {
  let mongo: StartedTestContainer | undefined;
  let uri: string;

  beforeAll(async () => {
    mongo = await startTestMongo();
    uri = `mongodb://${mongo.getHost()}:${mongo.getMappedPort(27017)}/cart`;
  });

  afterAll(async () => {
    await mongo?.stop();
  });

  async function createService(stock = 5) {
    const database = await new DataSource(
      cartDatabaseOptions(uri),
    ).initialize();
    onTestFinished(() => database.destroy());
    const repository = database.getMongoRepository(CartSchema);
    const updated = vi.fn();
    const module = await Test.createTestingModule({
      providers: [
        CartService,
        CartStore,
        { provide: getRepositoryToken(CartSchema), useValue: repository },
        {
          provide: SERVICE_NAMES.PRODUCTS,
          useValue: {
            send: (pattern: string, productId: string) =>
              of(
                pattern === PRODUCT_PATTERNS.FIND_ONE
                  ? { id: productId, name: productId, price: 10, stock }
                  : null,
              ),
          },
        },
        { provide: CartEventsPublisher, useValue: { updated } },
      ],
    }).compile();
    onTestFinished(() => module.close());
    return { service: module.get(CartService), repository, updated };
  }

  it('stores both products when independent services add to the same empty cart', async () => {
    const first = await createService();
    const second = await createService();
    const userId = 'buyer';
    const initialReads: (CartDocument | null)[] = [];
    let releaseBothReads!: () => void;
    const bothRead = new Promise<void>((resolve) => {
      releaseBothReads = resolve;
    });

    for (const { repository } of [first, second]) {
      const read = repository.findOne.bind(repository);
      vi.spyOn(repository, 'findOne').mockImplementationOnce(
        async (options) => {
          const document = await read(options);
          initialReads.push(document);
          // Both inserts must be based on an actual read of the absent cart.
          if (initialReads.length === 2) releaseBothReads();
          await bothRead;
          return document;
        },
      );
    }

    const writes = [
      first.service.addItem(userId, {
        productId: 'first-product',
        quantity: 1,
      }),
      second.service.addItem(userId, {
        productId: 'second-product',
        quantity: 2,
      }),
    ];
    try {
      await Promise.all(writes);
    } finally {
      releaseBothReads();
      await Promise.allSettled(writes);
    }
    expect(initialReads).toEqual([null, null]);

    const cart = await first.repository.findOneByOrFail({ _id: userId });
    expect(cart.total).toBe(30);
    expect(
      cart.items
        .map(({ productId, quantity }) => ({ productId, quantity }))
        .sort((a, b) => a.productId.localeCompare(b.productId)),
    ).toEqual([
      { productId: 'first-product', quantity: 1 },
      { productId: 'second-product', quantity: 2 },
    ]);
  });

  it.each([
    { stock: 20, requests: 12, expected: 12 },
    { stock: 3, requests: 8, expected: 3 },
  ])(
    'merges concurrent quantities and caps them at available stock $stock',
    async ({ stock, requests, expected }) => {
      const first = await createService(stock);
      const second = await createService(stock);
      const userId = randomUUID();
      const results = await Promise.allSettled(
        Array.from({ length: requests }, (_, index) =>
          (index % 2 ? first : second).service.addItem(userId, {
            productId: 'product',
            quantity: 1,
          }),
        ),
      );
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(expected);
      const refusals = results
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason as unknown);
      expect(refusals).toEqual(
        Array.from({ length: requests - expected }, () =>
          expect.objectContaining({
            message: `Only ${stock} units of "product" are in stock`,
          }),
        ),
      );
      const cart = await first.service.get(userId);
      expect(cart).toEqual({
        userId,
        total: expected * 10,
        updatedAt: expect.any(String),
        items: [
          {
            productId: 'product',
            name: 'product',
            quantity: expected,
            price: 10,
            subtotal: expected * 10,
          },
        ],
      });
      expect(
        first.updated.mock.calls.length + second.updated.mock.calls.length,
      ).toBe(expected);
    },
  );
});
