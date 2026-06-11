import type { CacheManagerOptions } from '@nestjs/cache-manager';
import { createKeyv } from '@keyv/redis';

export const DEFAULT_CACHE_TTL_MS = 30_000;

export interface AppCacheOptions {
  namespace: string;
  ttl?: number;
}

function buildRedisUrl(host: string, port: number, password?: string): string {
  const credentials = password ? `:${encodeURIComponent(password)}@` : '';
  return `redis://${credentials}${host}:${port}`;
}

export function buildCacheManagerOptions(
  options: AppCacheOptions,
): CacheManagerOptions {
  const ttl = options.ttl ?? DEFAULT_CACHE_TTL_MS;
  const host = process.env.REDIS_HOST;

  if (!host) {
    return { ttl };
  }

  const port = Number(process.env.REDIS_PORT ?? 6379);
  const url = buildRedisUrl(host, port, process.env.REDIS_PASSWORD);

  const store = createKeyv(url);
  store.namespace = options.namespace;

  return { stores: [store], ttl };
}
