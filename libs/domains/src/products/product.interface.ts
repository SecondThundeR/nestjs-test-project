import { z } from 'zod';

import { idSchema, isoDateTimeSchema, moneySchema } from '../common.schema.js';

export const productSchema = z.object({
  id: idSchema.meta({ format: 'uuid' }),
  name: z.string().meta({ example: 'Logitech PRO X2 SUPERSTRIKE' }),
  description: z.string(),
  price: moneySchema.meta({ example: 179.99 }),
  stock: z.int().nonnegative().meta({ example: 50 }),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Product = z.infer<typeof productSchema>;

export const productDeleteResultSchema = z.object({
  id: idSchema.meta({ format: 'uuid' }),
  deleted: z.literal(true),
});
export type ProductDeleteResult = z.infer<typeof productDeleteResultSchema>;
