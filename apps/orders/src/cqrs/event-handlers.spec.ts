import { ORDER_EVENTS, OrderStatus } from '@app/domains';
import type { ClientKafka } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';

import type { OrderEntity } from '../entities/order.entity';
import { OrderEventsPublisher } from './event-handlers';
import {
  OrderCancelledEvent,
  OrderCreatedEvent,
  OrderPaidEvent,
  OrderStatusChangedEvent,
} from './events';

function makeOrder(overrides: Partial<OrderEntity> = {}): OrderEntity {
  return {
    id: 'o1',
    userId: 'u1',
    items: [
      { productId: 'p1', name: 'Widget', price: 10, quantity: 2, subtotal: 20 },
    ],
    total: 20,
    status: OrderStatus.PENDING,
    shippingAddress: '1 Test Street',
    paymentId: null,
    captureId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createKafkaMock() {
  return {
    emit: jest.fn(() => of(undefined)),
    connect: jest.fn(),
    close: jest.fn(),
  };
}

type KafkaMock = ReturnType<typeof createKafkaMock>;

function createPublisher(kafka: KafkaMock) {
  return new OrderEventsPublisher(kafka as unknown as ClientKafka);
}

describe('OrderEventsPublisher', () => {
  it('connects the Kafka client on module init and closes it on shutdown', async () => {
    const kafka = createKafkaMock();
    const publisher = createPublisher(kafka);

    await publisher.onModuleInit();
    expect(kafka.connect).toHaveBeenCalled();

    await publisher.onApplicationShutdown();
    expect(kafka.close).toHaveBeenCalled();
  });

  it('publishes OrderCreatedEvent to the order.created topic keyed by order id', () => {
    const kafka = createKafkaMock();
    const order = makeOrder();

    createPublisher(kafka).handle(new OrderCreatedEvent(order));

    expect(kafka.emit).toHaveBeenCalledWith(ORDER_EVENTS.CREATED, {
      key: order.id,
      value: {
        orderId: order.id,
        userId: order.userId,
        total: order.total,
        items: order.items,
      },
    });
  });

  it.each([
    [OrderPaidEvent, ORDER_EVENTS.PAID, OrderStatus.PAID],
    [OrderCancelledEvent, ORDER_EVENTS.CANCELLED, OrderStatus.CANCELLED],
    [OrderStatusChangedEvent, ORDER_EVENTS.STATUS_CHANGED, OrderStatus.SHIPPED],
  ] as const)(
    'publishes %p to the %s topic with the order status payload',
    (EventClass, topic, status) => {
      const kafka = createKafkaMock();
      const order = makeOrder({ status });

      createPublisher(kafka).handle(new EventClass(order));

      expect(kafka.emit).toHaveBeenCalledWith(topic, {
        key: order.id,
        value: { orderId: order.id, userId: order.userId, status },
      });
    },
  );

  it('swallows and logs broker failures instead of throwing', () => {
    const kafka = createKafkaMock();
    kafka.emit.mockReturnValue(
      throwError(() => new Error('broker unavailable')),
    );
    const publisher = createPublisher(kafka);
    const errorSpy = jest
      .spyOn(publisher['logger'], 'error')
      .mockImplementation();

    expect(() =>
      publisher.handle(new OrderCreatedEvent(makeOrder())),
    ).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
  });
});
