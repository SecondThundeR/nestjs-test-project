import { z } from 'zod';

import { idSchema, isoDateTimeSchema, moneySchema } from '../common.schema.js';

export const cartItemSchema = z.object({
  productId: idSchema,
  name: z.string(),
  price: moneySchema,
  quantity: z.int().nonnegative(),
  subtotal: moneySchema,
});
export type CartItem = z.infer<typeof cartItemSchema>;

export const cartSchema = z.object({
  userId: idSchema,
  items: z.array(cartItemSchema),
  total: moneySchema,
  updatedAt: isoDateTimeSchema,
});
export type Cart = z.infer<typeof cartSchema>;
