import type { OrderItem, OrderStatus } from './order.interface.js';

export const ORDER_EVENTS = {
  CREATED: 'order.created',
  PAID: 'order.paid',
  CANCELLED: 'order.cancelled',
  STATUS_CHANGED: 'order.status-changed',
} as const;

export interface OrderCreatedEventPayload {
  orderId: string;
  userId: string;
  total: number;
  items: OrderItem[];
}

export interface OrderStatusChangedEventPayload {
  orderId: string;
  userId: string;
  status: OrderStatus;
}
