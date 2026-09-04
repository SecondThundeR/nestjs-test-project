import 'vitest';

declare module 'vitest' {
  interface Matchers<R, T> {
    toSatisfyApiSpec(): R;
    toSatisfySchemaInApiSpec(schemaName: string): R;
  }
}
