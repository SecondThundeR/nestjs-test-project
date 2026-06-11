import { DEFAULT_CACHE_TTL_MS } from '@app/cache';
import { registerAs } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';

export const cacheConfig = registerAs('cache', () => ({
  authCacheTtl: Number(process.env.AUTH_CACHE_TTL ?? DEFAULT_CACHE_TTL_MS),
  productsCacheTtl: Number(
    process.env.PRODUCTS_CACHE_TTL ?? DEFAULT_CACHE_TTL_MS,
  ),
  ordersCacheTtl: Number(process.env.ORDERS_CACHE_TTL ?? DEFAULT_CACHE_TTL_MS),
  cartCacheTtl: Number(process.env.CART_CACHE_TTL ?? DEFAULT_CACHE_TTL_MS),
  usersCacheTtl: Number(process.env.USERS_CACHE_TTL ?? DEFAULT_CACHE_TTL_MS),
}));

export type CacheConfig = ConfigType<typeof cacheConfig>;
