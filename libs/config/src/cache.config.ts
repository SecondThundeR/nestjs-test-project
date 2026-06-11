import { registerAs } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';

function optionalNumber(value: string | undefined): number | undefined {
  return value ? Number(value) : undefined;
}

export const cacheConfig = registerAs('cache', () => ({
  redis: {
    host: process.env.REDIS_HOST,
    port: optionalNumber(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD,
  },
  productsCacheTtl: optionalNumber(process.env.PRODUCTS_CACHE_TTL),
  usersCacheTtl: optionalNumber(process.env.USERS_CACHE_TTL),
  authCacheTtl: optionalNumber(process.env.AUTH_CACHE_TTL),
  ordersCacheTtl: optionalNumber(process.env.ORDERS_CACHE_TTL),
}));

export type CacheConfig = ConfigType<typeof cacheConfig>;
