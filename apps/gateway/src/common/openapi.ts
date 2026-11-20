import type { OpenAPIObject, SwaggerDocumentOptions } from '@nestjs/swagger';
import { createSchema } from 'zod-openapi';

export const standardSchemaDocumentOptions: SwaggerDocumentOptions = {
  standardSchemaConverter: (schema, { schemaType }) => {
    const converted = createSchema(schema as never, {
      io: schemaType,
      openapiVersion: '3.0.0',
    });
    return { schema: converted.schema, components: converted.components };
  },
};

export function filterPathsByTag(
  paths: OpenAPIObject['paths'],
  tag: string,
): OpenAPIObject['paths'] {
  const hasTag = (operation: unknown): boolean =>
    typeof operation === 'object' &&
    operation !== null &&
    'tags' in operation &&
    Array.isArray(operation.tags) &&
    operation.tags.includes(tag);

  return Object.fromEntries(
    Object.entries(paths).filter(([, pathItem]) =>
      Object.values(pathItem).some(hasTag),
    ),
  );
}
