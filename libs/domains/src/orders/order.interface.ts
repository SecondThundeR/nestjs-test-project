import { z } from 'zod';

import { idSchema, isoDateTimeSchema, moneySchema } from '../common.schema.js';

export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export const orderStatusSchema = z.enum(OrderStatus);

export const orderItemSchema = z.object({
  productId: idSchema,
  name: z.string(),
  price: moneySchema,
  quantity: z.int().positive(),
  subtotal: moneySchema,
});
export type OrderItem = z.infer<typeof orderItemSchema>;

export const orderSchema = z.object({
  id: idSchema,
  userId: idSchema,
  items: z.array(orderItemSchema),
  total: moneySchema,
  status: orderStatusSchema,
  shippingAddress: z.string(),
  paymentId: z.string().nullable(),
  captureId: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Order = z.infer<typeof orderSchema>;

export const orderPaymentSchema = z.object({
  orderId: idSchema,
  paymentId: z.string().min(1),
  paymentStatus: z.string(),
  approveUrl: z.url().nullable(),
});
export type OrderPayment = z.infer<typeof orderPaymentSchema>;
