import { z } from 'zod';

import { idSchema } from '../common.schema.js';

export const addCartItemSchema = z.strictObject({
  productId: idSchema,
  quantity: z.int().min(1),
});
export type AddCartItemDto = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.strictObject({
  quantity: z.int().nonnegative(),
});
export type UpdateCartItemDto = z.infer<typeof updateCartItemSchema>;

export const addCartItemPayloadSchema = z.strictObject({
  userId: idSchema,
  item: addCartItemSchema,
});
export type AddCartItemPayload = z.infer<typeof addCartItemPayloadSchema>;

export const updateCartItemPayloadSchema = updateCartItemSchema.extend({
  userId: idSchema,
  productId: idSchema,
});
export type UpdateCartItemPayload = z.infer<typeof updateCartItemPayloadSchema>;

export const removeCartItemPayloadSchema = z.strictObject({
  userId: idSchema,
  productId: idSchema,
});
export type RemoveCartItemPayload = z.infer<typeof removeCartItemPayloadSchema>;
