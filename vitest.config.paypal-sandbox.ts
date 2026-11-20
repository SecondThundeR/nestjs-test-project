import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['apps/orders/test/paypal.sandbox-spec.ts'],
    testTimeout: 30_000,
    retry: 0,
  },
});
