import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import {
  CART_PATTERNS,
  SERVICE_NAMES,
  type AddCartItemDto,
  type UpdateCartItemDto,
} from '@app/contracts';
import { CartGatewayController } from './cart.gateway.controller';

const USER = 'user-1';

describe('CartGatewayController', () => {
  let controller: CartGatewayController;
  let cart: { send: jest.Mock };

  beforeEach(async () => {
    cart = { send: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [CartGatewayController],
      providers: [{ provide: SERVICE_NAMES.CART, useValue: cart }],
    }).compile();

    controller = moduleRef.get(CartGatewayController);
  });

  it('forwards get() as a GET message with the userId', async () => {
    const result = { userId: USER, items: [] };
    cart.send.mockReturnValue(of(result));

    await expect(controller.get(USER)).resolves.toBe(result);
    expect(cart.send).toHaveBeenCalledWith(CART_PATTERNS.GET, USER);
  });

  it('forwards addItem() with userId and item', async () => {
    const dto: AddCartItemDto = { productId: 'p-1', quantity: 2 };
    const result = { userId: USER, items: [] };
    cart.send.mockReturnValue(of(result));

    await expect(controller.addItem(USER, dto)).resolves.toBe(result);
    expect(cart.send).toHaveBeenCalledWith(CART_PATTERNS.ADD_ITEM, {
      userId: USER,
      item: dto,
    });
  });

  it('forwards updateItem() with userId, productId and quantity', async () => {
    const dto: UpdateCartItemDto = { quantity: 5 };
    const result = { userId: USER, items: [] };
    cart.send.mockReturnValue(of(result));

    await expect(controller.updateItem(USER, 'p-1', dto)).resolves.toBe(result);
    expect(cart.send).toHaveBeenCalledWith(CART_PATTERNS.UPDATE_ITEM, {
      userId: USER,
      productId: 'p-1',
      quantity: 5,
    });
  });

  it('forwards removeItem() with userId and productId', async () => {
    const result = { userId: USER, items: [] };
    cart.send.mockReturnValue(of(result));

    await expect(controller.removeItem(USER, 'p-1')).resolves.toBe(result);
    expect(cart.send).toHaveBeenCalledWith(CART_PATTERNS.REMOVE_ITEM, {
      userId: USER,
      productId: 'p-1',
    });
  });

  it('forwards clear() as a CLEAR message with the userId', async () => {
    const result = { userId: USER, items: [] };
    cart.send.mockReturnValue(of(result));

    await expect(controller.clear(USER)).resolves.toBe(result);
    expect(cart.send).toHaveBeenCalledWith(CART_PATTERNS.CLEAR, USER);
  });
});
