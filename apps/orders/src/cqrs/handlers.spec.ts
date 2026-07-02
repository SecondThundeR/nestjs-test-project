import { OrderStatus } from '@app/domains';
import type { EventBus } from '@nestjs/cqrs';

import type { OrderEntity } from '../entities/order.entity';
import type { OrdersService } from '../orders.service';
import {
  CancelOrderCommand,
  CaptureByPaymentIdCommand,
  CapturePaymentCommand,
  CreateOrderCommand,
  PayOrderCommand,
  UpdateOrderStatusCommand,
} from './commands';
import {
  OrderCancelledEvent,
  OrderCreatedEvent,
  OrderPaidEvent,
  OrderStatusChangedEvent,
} from './events';
import {
  CancelOrderHandler,
  CaptureByPaymentIdHandler,
  CapturePaymentHandler,
  CreateOrderHandler,
  FindAllOrdersHandler,
  FindOneOrderHandler,
  PayOrderHandler,
  UpdateOrderStatusHandler,
} from './handlers';
import { FindAllOrdersQuery, FindOneOrderQuery } from './queries';

function createServiceMock() {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateStatus: jest.fn(),
    pay: jest.fn(),
    capturePayment: jest.fn(),
    captureByPaymentId: jest.fn(),
    cancel: jest.fn(),
  };
}

type OrdersServiceMock = ReturnType<typeof createServiceMock>;

function asService(mock: OrdersServiceMock): OrdersService {
  return mock as unknown as OrdersService;
}

function createEventBusMock() {
  return { publish: jest.fn() };
}

function asEventBus(mock: ReturnType<typeof createEventBusMock>): EventBus {
  return mock as unknown as EventBus;
}

describe('orders cqrs handlers', () => {
  it('CreateOrderHandler delegates to OrdersService.create and publishes OrderCreatedEvent', async () => {
    const orders = createServiceMock();
    const eventBus = createEventBusMock();
    const result = { id: 'o1' } as OrderEntity;
    orders.create.mockResolvedValue(result);
    const handler = new CreateOrderHandler(
      asService(orders),
      asEventBus(eventBus),
    );

    await expect(
      handler.execute(new CreateOrderCommand('u1', '123 Main St')),
    ).resolves.toBe(result);
    expect(orders.create).toHaveBeenCalledWith('u1', '123 Main St');
    expect(eventBus.publish).toHaveBeenCalledWith(
      new OrderCreatedEvent(result),
    );
  });

  it('CreateOrderHandler does not publish an event when creation fails', async () => {
    const orders = createServiceMock();
    const eventBus = createEventBusMock();
    orders.create.mockRejectedValue(new Error('empty cart'));
    const handler = new CreateOrderHandler(
      asService(orders),
      asEventBus(eventBus),
    );

    await expect(
      handler.execute(new CreateOrderCommand('u1', '123 Main St')),
    ).rejects.toThrow('empty cart');
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('UpdateOrderStatusHandler delegates to OrdersService.updateStatus and publishes OrderStatusChangedEvent', async () => {
    const orders = createServiceMock();
    const eventBus = createEventBusMock();
    const result = { id: 'o1', status: OrderStatus.SHIPPED } as OrderEntity;
    orders.updateStatus.mockResolvedValue(result);
    const handler = new UpdateOrderStatusHandler(
      asService(orders),
      asEventBus(eventBus),
    );

    await expect(
      handler.execute(new UpdateOrderStatusCommand('o1', OrderStatus.SHIPPED)),
    ).resolves.toBe(result);
    expect(orders.updateStatus).toHaveBeenCalledWith('o1', OrderStatus.SHIPPED);
    expect(eventBus.publish).toHaveBeenCalledWith(
      new OrderStatusChangedEvent(result),
    );
  });

  it('CancelOrderHandler delegates to OrdersService.cancel and publishes OrderCancelledEvent', async () => {
    const orders = createServiceMock();
    const eventBus = createEventBusMock();
    const result = { id: 'o1', status: OrderStatus.CANCELLED } as OrderEntity;
    orders.cancel.mockResolvedValue(result);
    const handler = new CancelOrderHandler(
      asService(orders),
      asEventBus(eventBus),
    );

    await expect(
      handler.execute(new CancelOrderCommand('o1', 'u1')),
    ).resolves.toBe(result);
    expect(orders.cancel).toHaveBeenCalledWith('o1', 'u1');
    expect(eventBus.publish).toHaveBeenCalledWith(
      new OrderCancelledEvent(result),
    );
  });

  it('PayOrderHandler delegates to OrdersService.pay', async () => {
    const orders = createServiceMock();
    const result = { approvalUrl: 'https://paypal.example/approve' };
    orders.pay.mockResolvedValue(result);
    const handler = new PayOrderHandler(asService(orders));

    await expect(
      handler.execute(new PayOrderCommand('o1', 'u1')),
    ).resolves.toBe(result);
    expect(orders.pay).toHaveBeenCalledWith('o1', 'u1');
  });

  it('CapturePaymentHandler delegates to OrdersService.capturePayment and publishes OrderPaidEvent', async () => {
    const orders = createServiceMock();
    const eventBus = createEventBusMock();
    const result = { id: 'o1', status: OrderStatus.PAID } as OrderEntity;
    orders.capturePayment.mockResolvedValue(result);
    const handler = new CapturePaymentHandler(
      asService(orders),
      asEventBus(eventBus),
    );

    await expect(
      handler.execute(new CapturePaymentCommand('o1', 'u1')),
    ).resolves.toBe(result);
    expect(orders.capturePayment).toHaveBeenCalledWith('o1', 'u1');
    expect(eventBus.publish).toHaveBeenCalledWith(new OrderPaidEvent(result));
  });

  it('CaptureByPaymentIdHandler delegates to OrdersService.captureByPaymentId and publishes OrderPaidEvent', async () => {
    const orders = createServiceMock();
    const eventBus = createEventBusMock();
    const result = { id: 'o1', status: OrderStatus.PAID } as OrderEntity;
    orders.captureByPaymentId.mockResolvedValue(result);
    const handler = new CaptureByPaymentIdHandler(
      asService(orders),
      asEventBus(eventBus),
    );

    await expect(
      handler.execute(new CaptureByPaymentIdCommand('pay1')),
    ).resolves.toBe(result);
    expect(orders.captureByPaymentId).toHaveBeenCalledWith('pay1');
    expect(eventBus.publish).toHaveBeenCalledWith(new OrderPaidEvent(result));
  });

  it('FindAllOrdersHandler delegates to OrdersService.findAll', async () => {
    const orders = createServiceMock();
    const result = [{ id: 'o1' }];
    orders.findAll.mockResolvedValue(result);
    const handler = new FindAllOrdersHandler(asService(orders));

    await expect(handler.execute(new FindAllOrdersQuery('u1'))).resolves.toBe(
      result,
    );
    expect(orders.findAll).toHaveBeenCalledWith('u1');
  });

  it('FindOneOrderHandler delegates to OrdersService.findOne', async () => {
    const orders = createServiceMock();
    const result = { id: 'o1' };
    orders.findOne.mockResolvedValue(result);
    const handler = new FindOneOrderHandler(asService(orders));

    await expect(
      handler.execute(new FindOneOrderQuery('o1', 'u1')),
    ).resolves.toBe(result);
    expect(orders.findOne).toHaveBeenCalledWith('o1', 'u1');
  });
});
