import { KAFKA_CLIENT } from '@app/config';
import {
  ORDER_EVENTS,
  type OrderCreatedEventPayload,
  type OrderStatusChangedEventPayload,
} from '@app/domains';
import {
  Inject,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import type { ClientKafka } from '@nestjs/microservices';

import type { OrderEntity } from '../entities/order.entity';
import {
  OrderCancelledEvent,
  OrderCreatedEvent,
  type OrderEvent,
  OrderPaidEvent,
  OrderStatusChangedEvent,
} from './events';

function orderCreatedPayload(order: OrderEntity): OrderCreatedEventPayload {
  return {
    orderId: order.id,
    userId: order.userId,
    total: order.total,
    items: order.items,
  };
}

function orderStatusPayload(
  order: OrderEntity,
): OrderStatusChangedEventPayload {
  return {
    orderId: order.id,
    userId: order.userId,
    status: order.status,
  };
}

@EventsHandler(
  OrderCreatedEvent,
  OrderPaidEvent,
  OrderCancelledEvent,
  OrderStatusChangedEvent,
)
export class OrderEventsPublisher
  implements IEventHandler<OrderEvent>, OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(OrderEventsPublisher.name);

  constructor(@Inject(KAFKA_CLIENT) private readonly kafka: ClientKafka) {}

  async onModuleInit() {
    await this.kafka.connect();
  }

  async onApplicationShutdown() {
    await this.kafka.close();
  }

  handle(event: OrderEvent) {
    const { topic, value } = this.toMessage(event);

    this.kafka.emit(topic, { key: event.order.id, value }).subscribe({
      next: () =>
        this.logger.log(`Published ${topic} for order ${event.order.id}`),
      error: (error: Error) =>
        this.logger.error(
          `Failed to publish ${topic} for order ${event.order.id}: ${error.message}`,
        ),
    });
  }

  private toMessage(event: OrderEvent): {
    topic: string;
    value: OrderCreatedEventPayload | OrderStatusChangedEventPayload;
  } {
    if (event instanceof OrderCreatedEvent) {
      return {
        topic: ORDER_EVENTS.CREATED,
        value: orderCreatedPayload(event.order),
      };
    }

    if (event instanceof OrderPaidEvent) {
      return {
        topic: ORDER_EVENTS.PAID,
        value: orderStatusPayload(event.order),
      };
    }

    if (event instanceof OrderCancelledEvent) {
      return {
        topic: ORDER_EVENTS.CANCELLED,
        value: orderStatusPayload(event.order),
      };
    }

    return {
      topic: ORDER_EVENTS.STATUS_CHANGED,
      value: orderStatusPayload(event.order),
    };
  }
}

export const ordersEventHandlers = [OrderEventsPublisher];
