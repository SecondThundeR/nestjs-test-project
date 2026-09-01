import type { SwaggerDocumentOptions } from '@nestjs/swagger';
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
