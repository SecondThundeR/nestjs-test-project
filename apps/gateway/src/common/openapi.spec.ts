import { z } from 'zod';

import { standardSchemaDocumentOptions } from './openapi.js';

describe('standardSchemaDocumentOptions', () => {
  const convert = standardSchemaDocumentOptions.standardSchemaConverter!;

  it('converts nullable fields using OpenAPI 3.0 syntax', () => {
    const result = convert(z.object({ name: z.string().nullable() }), {
      schemaType: 'input',
    });

    expect(result?.schema).toMatchObject({
      type: 'object',
      properties: { name: { type: 'string', nullable: true } },
      required: ['name'],
    });
  });

  it('keeps fields with defaults optional in input schemas', () => {
    const result = convert(z.object({ name: z.string().default('Widget') }), {
      schemaType: 'input',
    });

    expect(result?.schema).toMatchObject({
      properties: { name: { type: 'string', default: 'Widget' } },
    });
    expect(result?.schema).not.toHaveProperty('required');
  });

  it('requires fields with defaults in output schemas', () => {
    const result = convert(z.object({ name: z.string().default('Widget') }), {
      schemaType: 'output',
    });

    expect(result?.schema).toMatchObject({
      properties: { name: { type: 'string', default: 'Widget' } },
      required: ['name'],
    });
  });

  it('returns referenced schemas as components', () => {
    const product = z.object({ name: z.string() }).meta({ id: 'Product' });
    const result = convert(z.object({ product }), { schemaType: 'output' });

    expect(result?.schema).toMatchObject({
      properties: { product: { $ref: '#/components/schemas/Product' } },
    });
    expect(result?.components).toMatchObject({
      Product: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    });
  });
});
