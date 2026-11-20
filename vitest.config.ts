import ts from 'typescript';
import { defineConfig } from 'vitest/config';

let program: ts.Program | undefined;

export default defineConfig({
  plugins: [
    {
      name: 'typescript-decorator-metadata',
      enforce: 'pre',
      hotUpdate() {
        program = undefined;
      },
      transform(code, id) {
        if (
          !/\/(apps|libs)\/[^/]+\/src\/.+\.ts$/.test(id) ||
          id.endsWith('.spec.ts') ||
          !/^\s*@/m.test(code)
        )
          return;
        if (!program) {
          const config = ts.getParsedCommandLineOfConfigFile(
            'tsconfig.json',
            {
              declaration: false,
              incremental: false,
              // Keep compiler helpers in tslib so coverage maps to application code.
              importHelpers: true,
              noEmit: false,
            },
            {
              ...ts.sys,
              onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
                throw new Error(
                  ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
                );
              },
            },
          );
          if (!config) throw new Error('Unable to load tsconfig.json');
          program = ts.createProgram(config.fileNames, config.options);
        }
        const source = program.getSourceFile(id);
        if (!source) return;
        let output = '';
        let map = '';
        program.emit(source, (fileName, content) => {
          if (fileName.endsWith('.js')) output = content;
          if (fileName.endsWith('.js.map')) map = content;
        });
        if (!output || !map) throw new Error(`TypeScript did not emit ${id}`);
        const sourceMap = JSON.parse(map);
        sourceMap.sources = [source.fileName];
        sourceMap.sourcesContent = [code];
        return { code: output, map: sourceMap };
      },
    },
  ],
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          setupFiles: ['./test/setup-env.ts'],
          include: ['{apps,libs}/**/*.unit.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          globals: true,
          environment: 'node',
          setupFiles: ['./test/setup-env.ts'],
          include: ['{apps,libs,test}/**/*.integration-spec.ts'],
          // Includes pulling images on the first run.
          hookTimeout: 180_000,
          retry: 0,
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          environment: 'node',
          include: ['test/e2e/**/*.e2e-spec.ts'],
          testTimeout: 30_000,
          retry: 0,
        },
      },
      {
        extends: true,
        test: {
          name: 'paypal-sandbox',
          environment: 'node',
          include: ['apps/orders/test/paypal.sandbox-spec.ts'],
          testTimeout: 30_000,
          retry: 0,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage/unit',
      include: ['{apps,libs}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
      exclude: [
        '**/test/**',
        '**/*.d.{ts,mts,cts}',
        '**/*.spec.ts',
        'apps/*/src/{*.module,main,data-source}.ts',
        'apps/*/src/entities/*.entity.ts',
        'apps/*/src/migrations/*.ts',
        'apps/cart/src/schemas/cart.schema.ts',
        'apps/users/src/scripts/create-admin.cli.ts',
        'libs/cache/src/cache.module.ts',
      ],
    },
  },
});
