import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup-env.ts'],
    include: ['{apps,libs,test}/**/*.integration-spec.ts'],
    // Includes pulling images on the first run.
    hookTimeout: 180_000,
    retry: 0,
  },
});
