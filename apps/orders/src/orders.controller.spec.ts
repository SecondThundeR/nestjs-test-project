import { Test } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import {
  OrderStatus,
  type CreateOrderPayload,
  type UpdateOrderStatusPayload,
} from '@app/contracts';

describe('OrdersController', () => {
  let ordersController: OrdersController;
  let ordersService: jest.Mocked<
    Pick<
      OrdersService,
      'create' | 'findAll' | 'findOne' | 'updateStatus' | 'cancel'
    >
  >;

  beforeEach(async () => {
    ordersService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      updateStatus: jest.fn(),
      cancel: jest.fn(),
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

  it('delegates findOne() to the service with the id', () => {
    const order = {} as never;
    ordersService.findOne.mockReturnValue(order);

    expect(ordersController.findOne('order-1')).toBe(order);
    expect(ordersService.findOne).toHaveBeenCalledWith('order-1');
  });

  it('delegates updateStatus() to the service with id and status', () => {
    const payload: UpdateOrderStatusPayload = {
      id: 'order-1',
      status: OrderStatus.SHIPPED,
    };
    const order = {} as never;
    ordersService.updateStatus.mockReturnValue(order);

    expect(ordersController.updateStatus(payload)).toBe(order);
    expect(ordersService.updateStatus).toHaveBeenCalledWith(
      'order-1',
      OrderStatus.SHIPPED,
    );
  });

  it('delegates cancel() to the service with the id', () => {
    const result = Promise.resolve({} as never);
    ordersService.cancel.mockReturnValue(result);

    expect(ordersController.cancel('order-1')).toBe(result);
    expect(ordersService.cancel).toHaveBeenCalledWith('order-1');
  });
});
