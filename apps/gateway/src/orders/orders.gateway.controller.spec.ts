import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { of } from 'rxjs';
import {
  authConfig,
  ORDERS_PATTERNS,
  OrderStatus,
  SERVICE_NAMES,
  type CreateOrderDto,
  type UpdateOrderStatusDto,
} from '@app/contracts';
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
      providers: [{ provide: SERVICE_NAMES.ORDERS, useValue: orders }],
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

  it('forwards findOne() as a FIND_ONE message with the id', async () => {
    const result = { id: 'o-1' };
    orders.send.mockReturnValue(of(result));

    await expect(controller.findOne('o-1')).resolves.toBe(result);
    expect(orders.send).toHaveBeenCalledWith(ORDERS_PATTERNS.FIND_ONE, 'o-1');
  });

  it('forwards updateStatus() with id and status', async () => {
    const dto: UpdateOrderStatusDto = { status: OrderStatus.SHIPPED };
    const result = { id: 'o-1', status: OrderStatus.SHIPPED };
    orders.send.mockReturnValue(of(result));

    await expect(controller.updateStatus('o-1', dto)).resolves.toBe(result);
    expect(orders.send).toHaveBeenCalledWith(ORDERS_PATTERNS.UPDATE_STATUS, {
      id: 'o-1',
      status: OrderStatus.SHIPPED,
    });
  });

  it('forwards cancel() as a CANCEL message with the id', async () => {
    const result = { id: 'o-1', status: OrderStatus.CANCELLED };
    orders.send.mockReturnValue(of(result));

    await expect(controller.cancel('o-1')).resolves.toBe(result);
    expect(orders.send).toHaveBeenCalledWith(ORDERS_PATTERNS.CANCEL, 'o-1');
  });
});
