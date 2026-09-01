import { z } from 'zod';

const optionalNonEmptyString = z.string().min(1).optional();
const optionalPort = z.coerce.number().int().min(0).max(65535).optional();
const optionalPositiveInt = z.coerce.number().int().positive().optional();
const optionalNonNegativeInt = z.coerce.number().int().nonnegative().optional();

export const environmentSchema = z.object({
  LOG_LEVEL: optionalNonEmptyString,
  LOG_FORMAT: optionalNonEmptyString,
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: optionalNonEmptyString,
  REFRESH_TTL_DAYS: optionalPositiveInt,

  GATEWAY_PORT: optionalPort,
  PRODUCTS_PORT: optionalPort,
  CART_PORT: optionalPort,
  ORDERS_PORT: optionalPort,
  USERS_PORT: optionalPort,
  AUTH_PORT: optionalPort,
  PRODUCTS_HOST: optionalNonEmptyString,
  CART_HOST: optionalNonEmptyString,
  ORDERS_HOST: optionalNonEmptyString,
  USERS_HOST: optionalNonEmptyString,
  AUTH_HOST: optionalNonEmptyString,

  PAYPAL_API_URL: optionalNonEmptyString,
  PAYPAL_CLIENT_ID: optionalNonEmptyString,
  PAYPAL_CLIENT_SECRET: optionalNonEmptyString,
  PAYPAL_CURRENCY: optionalNonEmptyString,
  PAYPAL_RETURN_URL: optionalNonEmptyString,
  PAYPAL_CANCEL_URL: optionalNonEmptyString,

  DB_SYNCHRONIZE: optionalNonEmptyString,
  DB_MIGRATIONS_RUN: optionalNonEmptyString,
  KAFKA_BROKERS: optionalNonEmptyString,
  KAFKA_HOST_PORT: optionalPort,

  REDIS_HOST: optionalNonEmptyString,
  REDIS_PORT: optionalPort,
  REDIS_PASSWORD: optionalNonEmptyString,
  PRODUCTS_CACHE_TTL: optionalNonNegativeInt,
  USERS_CACHE_TTL: optionalNonNegativeInt,
  AUTH_CACHE_TTL: optionalNonNegativeInt,
  ORDERS_CACHE_TTL: optionalNonNegativeInt,

  PRODUCTS_DB_HOST: optionalNonEmptyString,
  PRODUCTS_DB_PORT: optionalPort,
  PRODUCTS_DB_USERNAME: optionalNonEmptyString,
  PRODUCTS_DB_PASSWORD: optionalNonEmptyString,
  PRODUCTS_DB_NAME: optionalNonEmptyString,
  CART_DB_HOST: optionalNonEmptyString,
  CART_DB_PORT: optionalPort,
  CART_DB_USERNAME: optionalNonEmptyString,
  CART_DB_PASSWORD: optionalNonEmptyString,
  CART_DB_NAME: optionalNonEmptyString,
  ORDERS_DB_HOST: optionalNonEmptyString,
  ORDERS_DB_PORT: optionalPort,
  ORDERS_DB_USERNAME: optionalNonEmptyString,
  ORDERS_DB_PASSWORD: optionalNonEmptyString,
  ORDERS_DB_NAME: optionalNonEmptyString,
  USERS_DB_HOST: optionalNonEmptyString,
  USERS_DB_PORT: optionalPort,
  USERS_DB_USERNAME: optionalNonEmptyString,
  USERS_DB_PASSWORD: optionalNonEmptyString,
  USERS_DB_NAME: optionalNonEmptyString,
  AUTH_DB_HOST: optionalNonEmptyString,
  AUTH_DB_PORT: optionalPort,
  AUTH_DB_USERNAME: optionalNonEmptyString,
  AUTH_DB_PASSWORD: optionalNonEmptyString,
  AUTH_DB_NAME: optionalNonEmptyString,
});

export type Environment = z.infer<typeof environmentSchema>;
