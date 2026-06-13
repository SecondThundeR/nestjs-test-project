import { Test } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import {
  OrderStatus,
  type CreateOrderPayload,
  type OrderActionPayload,
  type UpdateOrderStatusPayload,
} from '@app/domains';

describe('OrdersController', () => {
  let ordersController: OrdersController;
  let ordersService: jest.Mocked<
    Pick<
      OrdersService,
      | 'create'
      | 'findAll'
      | 'findOne'
      | 'updateStatus'
      | 'cancel'
      | 'pay'
      | 'capturePayment'
      | 'captureByPaymentId'
    >
  >;

  beforeEach(async () => {
    ordersService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      updateStatus: jest.fn(),
      cancel: jest.fn(),
      pay: jest.fn(),
      capturePayment: jest.fn(),
      captureByPaymentId: jest.fn(),
    };

    const app = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: ordersService }],
    }).compile();

    ordersController = app.get<OrdersController>(OrdersController);
  });

  it('delegates create() to the service with userId and shippingAddress', () => {
    const payload: CreateOrderPayload = {
      userId: 'user-1',
      shippingAddress: '1 Test Street',
    };
    const result = Promise.resolve({} as never);
    ordersService.create.mockReturnValue(result);

    expect(ordersController.create(payload)).toBe(result);
    expect(ordersService.create).toHaveBeenCalledWith(
      'user-1',
      '1 Test Street',
    );
  });

  it('delegates findAll() to the service with the optional userId', () => {
    const orders = [] as never;
    ordersService.findAll.mockReturnValue(orders);

    expect(ordersController.findAll('user-1')).toBe(orders);
    expect(ordersService.findAll).toHaveBeenCalledWith('user-1');
  });

  it('delegates findOne() to the service with the id and userId', () => {
    const payload: OrderActionPayload = { id: 'order-1', userId: 'user-1' };
    const order = {} as never;
    ordersService.findOne.mockReturnValue(order);

    expect(ordersController.findOne(payload)).toBe(order);
    expect(ordersService.findOne).toHaveBeenCalledWith('order-1', 'user-1');
  });

  it('delegates updateStatus() to the service with id, status and userId', () => {
    const payload: UpdateOrderStatusPayload = {
      id: 'order-1',
      userId: 'user-1',
      status: OrderStatus.SHIPPED,
    };
    const order = {} as never;
    ordersService.updateStatus.mockReturnValue(order);

    expect(ordersController.updateStatus(payload)).toBe(order);
    expect(ordersService.updateStatus).toHaveBeenCalledWith(
      'order-1',
      OrderStatus.SHIPPED,
      'user-1',
    );
  });

  it('delegates cancel() to the service with the id and userId', () => {
    const payload: OrderActionPayload = { id: 'order-1', userId: 'user-1' };
    const result = Promise.resolve({} as never);
    ordersService.cancel.mockReturnValue(result);

    expect(ordersController.cancel(payload)).toBe(result);
    expect(ordersService.cancel).toHaveBeenCalledWith('order-1', 'user-1');
  });

  it('delegates pay() to the service with the id and userId', () => {
    const payload: OrderActionPayload = { id: 'order-1', userId: 'user-1' };
    const result = Promise.resolve({} as never);
    ordersService.pay.mockReturnValue(result);

    expect(ordersController.pay(payload)).toBe(result);
    expect(ordersService.pay).toHaveBeenCalledWith('order-1', 'user-1');
  });

  it('delegates capturePayment() to the service with the id and userId', () => {
    const payload: OrderActionPayload = { id: 'order-1', userId: 'user-1' };
    const result = Promise.resolve({} as never);
    ordersService.capturePayment.mockReturnValue(result);

    expect(ordersController.capturePayment(payload)).toBe(result);
    expect(ordersService.capturePayment).toHaveBeenCalledWith(
      'order-1',
      'user-1',
    );
  });

  it('delegates captureByPaymentId() to the service with the payment id', () => {
    const result = Promise.resolve({} as never);
    ordersService.captureByPaymentId.mockReturnValue(result);

    expect(ordersController.captureByPaymentId('pp-1')).toBe(result);
    expect(ordersService.captureByPaymentId).toHaveBeenCalledWith('pp-1');
  });
});
