import { z } from 'zod';

import { idSchema, moneySchema } from '../common.schema.js';
import { orderItemSchema, orderStatusSchema } from './order.interface.js';

export const ORDER_EVENTS = {
  CREATED: 'order.created',
  PAID: 'order.paid',
  CANCELLED: 'order.cancelled',
  STATUS_CHANGED: 'order.status-changed',
} as const;

export const orderCreatedEventPayloadSchema = z.strictObject({
  orderId: idSchema,
  userId: idSchema,
  total: moneySchema,
  items: z.array(orderItemSchema),
});
export type OrderCreatedEventPayload = z.infer<
  typeof orderCreatedEventPayloadSchema
>;

export const orderStatusChangedEventPayloadSchema = z.strictObject({
  orderId: idSchema,
  userId: idSchema,
  status: orderStatusSchema,
});
export type OrderStatusChangedEventPayload = z.infer<
  typeof orderStatusChangedEventPayloadSchema
>;
