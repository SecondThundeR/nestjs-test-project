import { OrderStatus } from '@app/domains';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import { expect, it, vi } from 'vitest';
import {
  CancelOrderCommand,
  CaptureByPaymentIdCommand,
  CapturePaymentCommand,
  CreateOrderCommand,
  PayOrderCommand,
  UpdateOrderStatusCommand,
} from './cqrs/commands.js';
import { FindAllOrdersQuery, FindOneOrderQuery } from './cqrs/queries.js';
import { OrdersController } from './orders.controller.js';

const action = { id: 'order', userId: 'buyer' };
const input = { userId: 'buyer', shippingAddress: 'Test address' };
const status = { id: 'order', status: OrderStatus.SHIPPED };

it.each([
  [
    'create',
    (controller: OrdersController) => controller.create(input),
    new CreateOrderCommand(input.userId, input.shippingAddress),
  ],
  [
    'update status',
    (controller: OrdersController) => controller.updateStatus(status),
    new UpdateOrderStatusCommand(status.id, status.status),
  ],
  [
    'cancel',
    (controller: OrdersController) => controller.cancel(action),
    new CancelOrderCommand(action.id, action.userId),
  ],
  [
    'pay',
    (controller: OrdersController) => controller.pay(action),
    new PayOrderCommand(action.id, action.userId),
  ],
  [
    'capture',
    (controller: OrdersController) => controller.capturePayment(action),
    new CapturePaymentCommand(action.id, action.userId),
  ],
  [
    'capture by payment ID',
    (controller: OrdersController) => controller.captureByPaymentId('payment'),
    new CaptureByPaymentIdCommand('payment'),
  ],
] as const)('dispatches the %s command', async (_name, dispatch, command) => {
  const execute = vi.fn().mockResolvedValue('command result');
  const controller = new OrdersController(
    { execute } as unknown as CommandBus,
    {} as QueryBus,
  );
  await expect(dispatch(controller)).resolves.toBe('command result');
  expect(execute).toHaveBeenCalledExactlyOnceWith(command);
});

it.each([
  [
    'list',
    (controller: OrdersController) => controller.findAll(action.userId),
    new FindAllOrdersQuery(action.userId),
  ],
  [
    'read',
    (controller: OrdersController) => controller.findOne(action),
    new FindOneOrderQuery(action.id, action.userId),
  ],
] as const)(
  'dispatches the %s query with owner scope',
  async (_name, dispatch, query) => {
    const execute = vi.fn().mockResolvedValue('query result');
    const controller = new OrdersController(
      {} as CommandBus,
      { execute } as unknown as QueryBus,
    );
    await expect(dispatch(controller)).resolves.toBe('query result');
    expect(execute).toHaveBeenCalledExactlyOnceWith(query);
  },
);
