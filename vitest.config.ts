import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup-env.ts'],
    include: ['apps/**/*.spec.ts', 'libs/**/*.spec.ts'],
    exclude: ['apps/**/*.e2e-spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: [
        'apps/**/*.{controller,service}.ts',
        'apps/**/common/*.ts',
        'libs/**/filters/*.ts',
      ],
      exclude: [
        'apps/{auth,cart,orders,products,users}/src/*.controller.ts',
        '**/*.module.ts',
        '**/main.ts',
        '**/*.interface.ts',
        '**/*.dto.ts',
        '**/*.spec.ts',
        '**/*.e2e-spec.ts',
      ],
    },
  },
});
