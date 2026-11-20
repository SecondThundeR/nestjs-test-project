import { afterEach, expect, it, vi } from 'vitest';
import { authConfig } from './auth.config.js';
import { cacheConfig } from './cache.config.js';
import {
  buildDatabaseOptions,
  buildDataSourceOptions,
  isoTransformer,
  nullableIsoTransformer,
  numericTransformer,
} from './database.config.js';
import { kafkaConfig } from './kafka.config.js';
import { paypalConfig } from './paypal.config.js';
import { servicesConfig } from './services.config.js';

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}

afterEach(() => vi.unstubAllEnvs());

it('uses default auth and Kafka settings and reads explicit settings', () => {
  setEnv({
    JWT_SECRET: 'fixture-secret',
    JWT_EXPIRES_IN: undefined,
    REFRESH_TTL_DAYS: undefined,
    KAFKA_BROKERS: undefined,
  });
  expect(authConfig()).toEqual({
    secret: 'fixture-secret',
    expiresIn: '1h',
    refreshTtlMs: 604_800_000,
  });
  expect(kafkaConfig()).toEqual({ brokers: ['localhost:9094'] });
  setEnv({
    JWT_EXPIRES_IN: '15m',
    REFRESH_TTL_DAYS: '2',
    KAFKA_BROKERS: ' one:9092, , two:9093 ',
  });
  expect(authConfig()).toMatchObject({
    expiresIn: '15m',
    refreshTtlMs: 172_800_000,
  });
  expect(kafkaConfig()).toEqual({ brokers: ['one:9092', 'two:9093'] });
});

it('converts Redis ports and cache TTL overrides to numbers', () => {
  setEnv({
    REDIS_HOST: 'cache',
    REDIS_PORT: '6380',
    REDIS_PASSWORD: 'fixture',
    PRODUCTS_CACHE_TTL: '1500',
    USERS_CACHE_TTL: undefined,
    AUTH_CACHE_TTL: '0',
    ORDERS_CACHE_TTL: '',
  });
  expect(cacheConfig()).toEqual({
    redis: { host: 'cache', port: 6380, password: 'fixture' },
    productsCacheTtl: 1500,
    usersCacheTtl: undefined,
    authCacheTtl: 0,
    ordersCacheTtl: undefined,
  });
});

it('uses service defaults and accepts independent host and port overrides', () => {
  const defaults = {
    gateway: 3000,
    products: 3001,
    cart: 3002,
    orders: 3003,
    users: 3004,
    auth: 3005,
  };
  const names = Object.keys(defaults) as (keyof typeof defaults)[];
  const services = names.filter((name) => name !== 'gateway');
  setEnv(
    Object.fromEntries(
      names.map((name) => [`${name.toUpperCase()}_PORT`, undefined]),
    ),
  );
  setEnv(
    Object.fromEntries(
      services.map((name) => [`${name.toUpperCase()}_HOST`, undefined]),
    ),
  );
  expect(servicesConfig()).toEqual({
    ports: defaults,
    hosts: Object.fromEntries(services.map((name) => [name, '127.0.0.1'])),
  });
  setEnv(
    Object.fromEntries(
      names.map((name) => [
        `${name.toUpperCase()}_PORT`,
        String(defaults[name] + 1000),
      ]),
    ),
  );
  setEnv(
    Object.fromEntries(
      services.map((name) => [`${name.toUpperCase()}_HOST`, name]),
    ),
  );
  expect(servicesConfig()).toEqual({
    ports: Object.fromEntries(
      names.map((name) => [name, defaults[name] + 1000]),
    ),
    hosts: Object.fromEntries(services.map((name) => [name, name])),
  });
});

it('uses the configured SQL connection and migration settings for both entry points', () => {
  setEnv({
    PRODUCTS_DB_HOST: undefined,
    PRODUCTS_DB_PORT: undefined,
    PRODUCTS_DB_USERNAME: undefined,
    PRODUCTS_DB_PASSWORD: undefined,
    PRODUCTS_DB_NAME: undefined,
    DB_SYNCHRONIZE: undefined,
    DB_MIGRATIONS_RUN: undefined,
  });
  const entities = ['product'];
  const defaults = {
    type: 'postgres',
    host: '127.0.0.1',
    port: 5432,
    username: 'postgres',
    password: 'postgres',
    database: 'products',
    synchronize: false,
    migrationsRun: false,
    migrationsTableName: 'migrations',
    entities,
    migrations: [],
  };
  expect(buildDatabaseOptions('PRODUCTS', entities)).toEqual(defaults);
  expect(buildDataSourceOptions('PRODUCTS', entities)).toEqual(defaults);

  setEnv({
    PRODUCTS_DB_HOST: 'database',
    PRODUCTS_DB_PORT: '5544',
    PRODUCTS_DB_USERNAME: 'test-user',
    PRODUCTS_DB_PASSWORD: 'fixture',
    PRODUCTS_DB_NAME: 'catalog',
    DB_SYNCHRONIZE: 'true',
    DB_MIGRATIONS_RUN: 'true',
  });
  const migrations = ['migration'];
  const overridden = {
    ...defaults,
    host: 'database',
    port: 5544,
    username: 'test-user',
    password: 'fixture',
    database: 'catalog',
    synchronize: true,
    migrationsRun: true,
    migrations,
  };
  expect(buildDatabaseOptions('PRODUCTS', entities, migrations)).toEqual(
    overridden,
  );
  expect(buildDataSourceOptions('PRODUCTS', entities, migrations)).toEqual(
    overridden,
  );
});

it('preserves numeric values, timestamps and nulls through the database transformers', () => {
  const timestamp = '2026-01-01T00:00:00.000Z';
  expect(numericTransformer.to(12.3)).toBe(12.3);
  expect(numericTransformer.from('12.30')).toBe(12.3);
  expect(isoTransformer.to(timestamp)).toBe(timestamp);
  expect(isoTransformer.from(new Date(timestamp))).toBe(timestamp);
  expect(nullableIsoTransformer.to(timestamp)).toBe(timestamp);
  expect(nullableIsoTransformer.to(null)).toBeNull();
  expect(nullableIsoTransformer.from(new Date(timestamp))).toBe(timestamp);
  expect(nullableIsoTransformer.from(null)).toBeNull();
});

it('defaults to PayPal Sandbox and derives callbacks from the Gateway port', () => {
  setEnv({
    PAYPAL_API_URL: undefined,
    PAYPAL_CLIENT_ID: undefined,
    PAYPAL_CLIENT_SECRET: undefined,
    PAYPAL_CURRENCY: undefined,
    PAYPAL_RETURN_URL: undefined,
    PAYPAL_CANCEL_URL: undefined,
    GATEWAY_PORT: undefined,
  });
  expect(paypalConfig()).toEqual({
    apiUrl: 'https://api-m.sandbox.paypal.com',
    clientId: '',
    clientSecret: '',
    currency: 'USD',
    returnUrl: 'http://localhost:3000/api/orders/payment/return',
    cancelUrl: 'http://localhost:3000/api/orders/payment/cancel',
  });
  vi.stubEnv('GATEWAY_PORT', '4000');
  expect(paypalConfig().returnUrl).toBe(
    'http://localhost:4000/api/orders/payment/return',
  );
  setEnv({
    PAYPAL_API_URL: 'https://paypal.example.test',
    PAYPAL_CLIENT_ID: 'test-client',
    PAYPAL_CLIENT_SECRET: 'fixture',
    PAYPAL_CURRENCY: 'EUR',
    PAYPAL_RETURN_URL: 'https://example.test/return',
    PAYPAL_CANCEL_URL: 'https://example.test/cancel',
  });
  expect(paypalConfig()).toEqual({
    apiUrl: 'https://paypal.example.test',
    clientId: 'test-client',
    clientSecret: 'fixture',
    currency: 'EUR',
    returnUrl: 'https://example.test/return',
    cancelUrl: 'https://example.test/cancel',
  });
});
