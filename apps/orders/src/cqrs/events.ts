import type { OrderEntity } from '../entities/order.entity.js';

export class OrderCreatedEvent {
  constructor(public readonly order: OrderEntity) {}
}

export class OrderPaidEvent {
  constructor(public readonly order: OrderEntity) {}
}

export class OrderCancelledEvent {
  constructor(public readonly order: OrderEntity) {}
}

export class OrderStatusChangedEvent {
  constructor(public readonly order: OrderEntity) {}
}

export type OrderEvent =
  | OrderCreatedEvent
  | OrderPaidEvent
  | OrderCancelledEvent
  | OrderStatusChangedEvent;
