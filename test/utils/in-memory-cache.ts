import { CacheService } from '@app/cache';
import type { Cache } from 'cache-manager';

export function createInMemoryCache(): {
  service: CacheService;
  store: Map<string, unknown>;
} {
  const store = new Map<string, unknown>();

  const cache = {
    get: <T>(key: string): Promise<T | undefined> =>
      Promise.resolve(store.has(key) ? (store.get(key) as T) : undefined),
    set: (key: string, value: unknown): Promise<unknown> => {
      store.set(key, value);
      return Promise.resolve(value);
    },
    del: (key: string): Promise<boolean> => Promise.resolve(store.delete(key)),
  } as unknown as Cache;

  return { service: new CacheService(cache), store };
}
