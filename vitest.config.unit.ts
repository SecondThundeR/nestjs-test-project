import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const infrastructureFiles = readFileSync(
  new URL('./test/unit-coverage-infrastructure.txt', import.meta.url),
  'utf8',
).trimEnd();

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    setupFiles: ['./test/setup-env.ts'],
    include: ['{apps,libs}/**/*.unit.spec.ts'],
    coverage: {
      provider: 'v8',
      ignoreNode(node, type) {
        // Oxc emits a typeof fallback for imported decorator metadata types.
        // Limit the exclusion to the generated typeof/import/Object fallback shape.
        if (type !== 'branch' || node.type !== 'ConditionalExpression')
          return false;
        const { test, consequent, alternate } = node;
        return (
          test.type === 'BinaryExpression' &&
          test.operator === '===' &&
          test.right.type === 'Literal' &&
          test.right.value === 'undefined' &&
          test.left.type === 'UnaryExpression' &&
          test.left.operator === 'typeof' &&
          test.left.argument.type === 'MemberExpression' &&
          test.left.argument.object.type === 'Identifier' &&
          test.left.argument.object.name.startsWith('__vite_ssr_import_') &&
          consequent.type === 'Identifier' &&
          consequent.name === 'Object' &&
          alternate.type === 'MemberExpression' &&
          alternate.object.type === 'Identifier' &&
          alternate.object.name === test.left.argument.object.name &&
          alternate.property.type === 'Identifier' &&
          test.left.argument.property.type === 'Identifier' &&
          alternate.property.name === test.left.argument.property.name
        );
      },
      reportsDirectory: 'coverage/unit',
      include: ['{apps,libs}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
      exclude: [
        '**/test/**',
        '**/*.d.{ts,mts,cts}',
        '**/*.spec.ts',
        ...infrastructureFiles.split(/\r?\n/).filter(Boolean),
      ],
      thresholds: {
        perFile: true,
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
