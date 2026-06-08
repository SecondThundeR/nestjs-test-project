import { Test } from '@nestjs/testing';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import type {
  AddCartItemPayload,
  RemoveCartItemPayload,
  UpdateCartItemPayload,
} from '@app/domains';

describe('CartController', () => {
  let cartController: CartController;
  let cartService: jest.Mocked<
    Pick<CartService, 'get' | 'addItem' | 'updateItem' | 'removeItem' | 'clear'>
  >;

  beforeEach(async () => {
    cartService = {
      get: jest.fn(),
      addItem: jest.fn(),
      updateItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
    };

    const app = await Test.createTestingModule({
      controllers: [CartController],
      providers: [{ provide: CartService, useValue: cartService }],
    }).compile();

    cartController = app.get<CartController>(CartController);
  });

  it('delegates get() to the service with the userId', () => {
    const cart = Promise.resolve({
      userId: 'user-1',
      items: [],
      total: 0,
      updatedAt: 'now',
    });
    cartService.get.mockReturnValue(cart);

    expect(cartController.get('user-1')).toBe(cart);
    expect(cartService.get).toHaveBeenCalledWith('user-1');
  });

  it('delegates addItem() to the service with userId and item', () => {
    const payload: AddCartItemPayload = {
      userId: 'user-1',
      item: { productId: 'p-1', quantity: 2 },
    };
    const result = Promise.resolve({} as never);
    cartService.addItem.mockReturnValue(result);

    expect(cartController.addItem(payload)).toBe(result);
    expect(cartService.addItem).toHaveBeenCalledWith('user-1', payload.item);
  });

  it('delegates updateItem() to the service with userId, productId, quantity', () => {
    const payload: UpdateCartItemPayload = {
      userId: 'user-1',
      productId: 'p-1',
      quantity: 5,
    };
    const result = Promise.resolve({} as never);
    cartService.updateItem.mockReturnValue(result);

    expect(cartController.updateItem(payload)).toBe(result);
    expect(cartService.updateItem).toHaveBeenCalledWith('user-1', 'p-1', 5);
  });

  it('delegates removeItem() to the service with userId and productId', () => {
    const payload: RemoveCartItemPayload = {
      userId: 'user-1',
      productId: 'p-1',
    };
    const cart = Promise.resolve({
      userId: 'user-1',
      items: [],
      total: 0,
      updatedAt: 'now',
    });
    cartService.removeItem.mockReturnValue(cart);

    expect(cartController.removeItem(payload)).toBe(cart);
    expect(cartService.removeItem).toHaveBeenCalledWith('user-1', 'p-1');
  });

  it('delegates clear() to the service with the userId', () => {
    const cart = Promise.resolve({
      userId: 'user-1',
      items: [],
      total: 0,
      updatedAt: 'now',
    });
    cartService.clear.mockReturnValue(cart);

    expect(cartController.clear('user-1')).toBe(cart);
    expect(cartService.clear).toHaveBeenCalledWith('user-1');
  });
});
