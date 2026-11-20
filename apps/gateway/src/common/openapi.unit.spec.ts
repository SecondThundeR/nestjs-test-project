import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { filterPathsByTag, standardSchemaDocumentOptions } from './openapi.js';

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

it('keeps only paths containing an operation from the requested tag', () => {
  const products = { get: { tags: ['products'], responses: {} } };
  const paths = {
    '/products': products,
    '/orders': { get: { tags: ['orders'], responses: {} } },
    '/metadata': {
      summary: 'Path summary',
      get: { responses: {} },
      post: { tags: 'products' },
      patch: null,
    },
  };
  expect(
    filterPathsByTag(
      paths as unknown as Parameters<typeof filterPathsByTag>[0],
      'products',
    ),
  ).toEqual({
    '/products': products,
  });
});
