import { environmentSchema } from './env.validation.js';

describe('environmentSchema', () => {
  it('coerces numeric environment variables', () => {
    const result = environmentSchema.parse({
      JWT_SECRET: 'test-secret',
      GATEWAY_PORT: '3000',
      REFRESH_TTL_DAYS: '7',
      PRODUCTS_CACHE_TTL: '0',
    });

    expect(result).toMatchObject({
      GATEWAY_PORT: 3000,
      REFRESH_TTL_DAYS: 7,
      PRODUCTS_CACHE_TTL: 0,
    });
  });

  it('requires JWT_SECRET', () => {
    expect(environmentSchema.safeParse({}).success).toBe(false);
  });

  it.each(['-1', '65536', '1.5', 'not-a-number'])(
    'rejects invalid port %s',
    (port) => {
      expect(
        environmentSchema.safeParse({
          JWT_SECRET: 'test-secret',
          GATEWAY_PORT: port,
        }).success,
      ).toBe(false);
    },
  );
});
