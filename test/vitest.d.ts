import 'vitest';

declare module 'vitest' {
  interface Assertion<T = any> {
    toSatisfyApiSpec(): T;
    toSatisfySchemaInApiSpec(schemaName: string): T;
  }
}
