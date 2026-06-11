import type { CacheManagerOptions } from '@nestjs/cache-manager';
import { Logger } from '@nestjs/common';
import { createKeyv } from '@keyv/redis';

export const DEFAULT_CACHE_TTL_MS = 30_000;
const DEFAULT_REDIS_PORT = 6379;

const logger = new Logger('AppCache');

export interface AppCacheRedisOptions {
  host?: string;
  port?: number;
  password?: string;
}

export interface AppCacheOptions {
  namespace: string;
  ttl?: number;
  redis?: AppCacheRedisOptions;
}

function buildRedisUrl(host: string, port: number, password?: string): string {
  const credentials = password ? `:${encodeURIComponent(password)}@` : '';
  return `redis://${credentials}${host}:${port}`;
}

export function buildCacheManagerOptions(
  options: AppCacheOptions,
): CacheManagerOptions {
  const ttl = options.ttl ?? DEFAULT_CACHE_TTL_MS;
  const host = options.redis?.host;

  if (!host) {
    logger.log(
      `No REDIS_HOST configured - using in-memory cache for namespace "${options.namespace}" (ttl ${ttl}ms)`,
    );
    return { ttl };
  }

  const port = options.redis?.port ?? DEFAULT_REDIS_PORT;
  const url = buildRedisUrl(host, port, options.redis?.password);

  const store = createKeyv(url);
  store.namespace = options.namespace;
  // The Keyv store is an EventEmitter: an unhandled 'error' event (e.g. Redis
  // unreachable) would otherwise crash the process. Log and keep degrading
  // gracefully - CacheService swallows operation errors separately.
  store.on('error', (error: unknown) =>
    logger.warn(
      `Redis cache unavailable (namespace "${options.namespace}"): ${
        error instanceof Error ? error.message : String(error)
      }`,
    ),
  );

  return { stores: [store], ttl };
}
