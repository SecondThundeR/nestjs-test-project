import { OrderStatus } from '@app/domains';

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

describe('orders cqrs handlers', () => {
  it('CreateOrderHandler delegates to OrdersService.create', async () => {
    const orders = createServiceMock();
    const result = { id: 'o1' };
    orders.create.mockResolvedValue(result);
    const handler = new CreateOrderHandler(asService(orders));

    await expect(
      handler.execute(new CreateOrderCommand('u1', '123 Main St')),
    ).resolves.toBe(result);
    expect(orders.create).toHaveBeenCalledWith('u1', '123 Main St');
  });

  it('UpdateOrderStatusHandler delegates to OrdersService.updateStatus', async () => {
    const orders = createServiceMock();
    const result = { id: 'o1', status: OrderStatus.SHIPPED };
    orders.updateStatus.mockResolvedValue(result);
    const handler = new UpdateOrderStatusHandler(asService(orders));

    await expect(
      handler.execute(new UpdateOrderStatusCommand('o1', OrderStatus.SHIPPED)),
    ).resolves.toBe(result);
    expect(orders.updateStatus).toHaveBeenCalledWith('o1', OrderStatus.SHIPPED);
  });

  it('CancelOrderHandler delegates to OrdersService.cancel', async () => {
    const orders = createServiceMock();
    const result = { id: 'o1', status: OrderStatus.CANCELLED };
    orders.cancel.mockResolvedValue(result);
    const handler = new CancelOrderHandler(asService(orders));

    await expect(
      handler.execute(new CancelOrderCommand('o1', 'u1')),
    ).resolves.toBe(result);
    expect(orders.cancel).toHaveBeenCalledWith('o1', 'u1');
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

  it('CapturePaymentHandler delegates to OrdersService.capturePayment', async () => {
    const orders = createServiceMock();
    const result = { id: 'o1', status: OrderStatus.PAID };
    orders.capturePayment.mockResolvedValue(result);
    const handler = new CapturePaymentHandler(asService(orders));

    await expect(
      handler.execute(new CapturePaymentCommand('o1', 'u1')),
    ).resolves.toBe(result);
    expect(orders.capturePayment).toHaveBeenCalledWith('o1', 'u1');
  });

  it('CaptureByPaymentIdHandler delegates to OrdersService.captureByPaymentId', async () => {
    const orders = createServiceMock();
    const result = { id: 'o1', status: OrderStatus.PAID };
    orders.captureByPaymentId.mockResolvedValue(result);
    const handler = new CaptureByPaymentIdHandler(asService(orders));

    await expect(
      handler.execute(new CaptureByPaymentIdCommand('pay1')),
    ).resolves.toBe(result);
    expect(orders.captureByPaymentId).toHaveBeenCalledWith('pay1');
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
