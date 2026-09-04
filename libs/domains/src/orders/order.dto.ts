import { z } from 'zod';

import { idSchema } from '../common.schema.js';
import { orderStatusSchema } from './order.interface.js';

export const createOrderSchema = z.strictObject({
  shippingAddress: z.string().min(5),
});
export type CreateOrderDto = z.infer<typeof createOrderSchema>;

export const updateOrderStatusSchema = z.strictObject({
  status: orderStatusSchema,
});
export type UpdateOrderStatusDto = z.infer<typeof updateOrderStatusSchema>;

export const createOrderPayloadSchema = createOrderSchema.extend({
  userId: idSchema,
});
export type CreateOrderPayload = z.infer<typeof createOrderPayloadSchema>;

export const orderActionPayloadSchema = z.strictObject({
  id: idSchema,
  userId: idSchema,
});
export type OrderActionPayload = z.infer<typeof orderActionPayloadSchema>;

export const updateOrderStatusPayloadSchema = updateOrderStatusSchema.extend({
  id: idSchema,
});
export type UpdateOrderStatusPayload = z.infer<
  typeof updateOrderStatusPayloadSchema
>;
