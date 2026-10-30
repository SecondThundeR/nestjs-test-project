import { z } from 'zod';
import { idSchema } from '../common.schema.js';

export const stockItemsSchema = z
  .array(
    z.strictObject({
      productId: idSchema,
      quantity: z.int().positive().max(2147483647),
    }),
  )
  .min(1)
  .refine(
    (items) =>
      new Set(items.map((item) => item.productId)).size === items.length,
    'Duplicate product IDs',
  );
export const reserveStockSchema = z.strictObject({
  reservationId: idSchema,
  items: stockItemsSchema,
});
export const releaseStockSchema = z.strictObject({
  reservationId: idSchema,
  legacyItems: stockItemsSchema.optional(),
});
export type ReserveStockDto = z.infer<typeof reserveStockSchema>;
export type ReleaseStockDto = z.infer<typeof releaseStockSchema>;
