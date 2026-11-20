import { EventEmitter } from 'node:events';
import { createKeyv } from '@keyv/redis';
import { Logger } from '@nestjs/common';
import { afterEach, expect, it, vi } from 'vitest';
import { buildCacheManagerOptions } from './cache.options.js';

vi.mock('@keyv/redis', () => ({ createKeyv: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

it('uses the default TTL and memory cache when no Redis host is set', () => {
  expect(buildCacheManagerOptions({ namespace: 'products' })).toEqual({
    ttl: 30_000,
  });
  expect(createKeyv).not.toHaveBeenCalled();
});

it.each([
  [{ host: 'redis' }, 'redis://redis:6379'],
  [
    { host: 'redis', port: 6380, password: 'p@ss:word' },
    'redis://:p%40ss%3Aword@redis:6380',
  ],
] as const)(
  'configures a namespaced Redis store for %j and handles backend errors',
  (redis, url) => {
    const store = Object.assign(new EventEmitter(), {
      namespace: undefined as string | undefined,
    });
    vi.mocked(createKeyv).mockReturnValueOnce(
      store as unknown as ReturnType<typeof createKeyv>,
    );
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    expect(
      buildCacheManagerOptions({ namespace: 'products', ttl: 500, redis }),
    ).toEqual({
      ttl: 500,
      stores: [store],
    });
    expect(createKeyv).toHaveBeenLastCalledWith(url);
    expect(store.namespace).toBe('products');
    store.emit('error', new Error('connection down'));
    store.emit('error', 'connection reset');
    expect(warn.mock.calls).toEqual([
      ['Redis cache unavailable (namespace "products"): connection down'],
      ['Redis cache unavailable (namespace "products"): connection reset'],
    ]);
  },
);
