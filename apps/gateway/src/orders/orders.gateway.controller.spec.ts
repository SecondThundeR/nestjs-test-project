import { authConfig, SERVICE_NAMES } from '@app/config';
import {
  type CreateOrderDto,
  ORDERS_PATTERNS,
  OrderStatus,
  type UpdateOrderStatusDto,
} from '@app/domains';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';

import { OrdersGatewayController } from './orders.gateway.controller';

const USER = 'user-1';

describe('OrdersGatewayController', () => {
  let controller: OrdersGatewayController;
  let orders: { send: jest.Mock };

  beforeEach(async () => {
    orders = { send: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: authConfig().secret })],
      controllers: [OrdersGatewayController],
      providers: [
        { provide: SERVICE_NAMES.ORDERS, useValue: orders },
        { provide: SERVICE_NAMES.AUTH, useValue: { send: jest.fn() } },
      ],
    }).compile();

    controller = moduleRef.get(OrdersGatewayController);
  });

  it('forwards create() with userId and shippingAddress', async () => {
    const dto: CreateOrderDto = { shippingAddress: '1 Test Street' };
    const result = { id: 'o-1' };
    orders.send.mockReturnValue(of(result));

    await expect(controller.create(USER, dto)).resolves.toBe(result);
    expect(orders.send).toHaveBeenCalledWith(ORDERS_PATTERNS.CREATE, {
      userId: USER,
      shippingAddress: '1 Test Street',
    });
  });

  it('forwards findAll() as a FIND_ALL message with the userId', async () => {
    const result = [{ id: 'o-1' }];
    orders.send.mockReturnValue(of(result));

    await expect(controller.findAll(USER)).resolves.toBe(result);
    expect(orders.send).toHaveBeenCalledWith(ORDERS_PATTERNS.FIND_ALL, USER);
  });

  it('forwards findOne() as a FIND_ONE message with the id and userId', async () => {
    const result = { id: 'o-1' };
    orders.send.mockReturnValue(of(result));

    await expect(controller.findOne(USER, 'o-1')).resolves.toBe(result);
    expect(orders.send).toHaveBeenCalledWith(ORDERS_PATTERNS.FIND_ONE, {
      id: 'o-1',
      userId: USER,
    });
  });

  it('forwards updateStatus() with id, status and userId', async () => {
    const dto: UpdateOrderStatusDto = { status: OrderStatus.SHIPPED };
    const result = { id: 'o-1', status: OrderStatus.SHIPPED };
    orders.send.mockReturnValue(of(result));

    await expect(controller.updateStatus(USER, 'o-1', dto)).resolves.toBe(
      result,
    );
    expect(orders.send).toHaveBeenCalledWith(ORDERS_PATTERNS.UPDATE_STATUS, {
      id: 'o-1',
      userId: USER,
      status: OrderStatus.SHIPPED,
    });
  });

  it('forwards cancel() as a CANCEL message with the id and userId', async () => {
    const result = { id: 'o-1', status: OrderStatus.CANCELLED };
    orders.send.mockReturnValue(of(result));

    await expect(controller.cancel(USER, 'o-1')).resolves.toBe(result);
    expect(orders.send).toHaveBeenCalledWith(ORDERS_PATTERNS.CANCEL, {
      id: 'o-1',
      userId: USER,
    });
  });

  it('forwards pay() as a PAY message with the id and userId', async () => {
    const result = {
      orderId: 'o-1',
      paymentId: 'pp-1',
      paymentStatus: 'CREATED',
      approveUrl: 'https://paypal.test/approve',
    };
    orders.send.mockReturnValue(of(result));

    await expect(controller.pay(USER, 'o-1')).resolves.toBe(result);
    expect(orders.send).toHaveBeenCalledWith(ORDERS_PATTERNS.PAY, {
      id: 'o-1',
      userId: USER,
    });
  });

  it('forwards capturePayment() as a CAPTURE_PAYMENT message with the id and userId', async () => {
    const result = { id: 'o-1', status: OrderStatus.PAID };
    orders.send.mockReturnValue(of(result));

    await expect(controller.capturePayment(USER, 'o-1')).resolves.toBe(result);
    expect(orders.send).toHaveBeenCalledWith(ORDERS_PATTERNS.CAPTURE_PAYMENT, {
      id: 'o-1',
      userId: USER,
    });
  });
});
