import type { CartService } from '../cart.service';
import {
  AddCartItemCommand,
  ClearCartCommand,
  RemoveCartItemCommand,
  UpdateCartItemCommand,
} from './commands';
import {
  AddCartItemHandler,
  ClearCartHandler,
  GetCartHandler,
  RemoveCartItemHandler,
  UpdateCartItemHandler,
} from './handlers';
import { GetCartQuery } from './queries';

function createServiceMock() {
  return {
    get: jest.fn(),
    addItem: jest.fn(),
    updateItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  };
}

type CartServiceMock = ReturnType<typeof createServiceMock>;

function asService(mock: CartServiceMock): CartService {
  return mock as unknown as CartService;
}

describe('cart cqrs handlers', () => {
  it('AddCartItemHandler delegates to CartService.addItem', async () => {
    const cart = createServiceMock();
    const result = { userId: 'u1', items: [], total: 0 };
    cart.addItem.mockResolvedValue(result);
    const handler = new AddCartItemHandler(asService(cart));

    const item = { productId: 'p1', quantity: 2 } as never;
    await expect(
      handler.execute(new AddCartItemCommand('u1', item)),
    ).resolves.toBe(result);
    expect(cart.addItem).toHaveBeenCalledWith('u1', item);
  });

  it('UpdateCartItemHandler delegates to CartService.updateItem', async () => {
    const cart = createServiceMock();
    const result = { userId: 'u1', items: [], total: 0 };
    cart.updateItem.mockResolvedValue(result);
    const handler = new UpdateCartItemHandler(asService(cart));

    await expect(
      handler.execute(new UpdateCartItemCommand('u1', 'p1', 3)),
    ).resolves.toBe(result);
    expect(cart.updateItem).toHaveBeenCalledWith('u1', 'p1', 3);
  });

  it('RemoveCartItemHandler delegates to CartService.removeItem', async () => {
    const cart = createServiceMock();
    const result = { userId: 'u1', items: [], total: 0 };
    cart.removeItem.mockResolvedValue(result);
    const handler = new RemoveCartItemHandler(asService(cart));

    await expect(
      handler.execute(new RemoveCartItemCommand('u1', 'p1')),
    ).resolves.toBe(result);
    expect(cart.removeItem).toHaveBeenCalledWith('u1', 'p1');
  });

  it('ClearCartHandler delegates to CartService.clear', async () => {
    const cart = createServiceMock();
    const result = { userId: 'u1', items: [], total: 0 };
    cart.clear.mockResolvedValue(result);
    const handler = new ClearCartHandler(asService(cart));

    await expect(handler.execute(new ClearCartCommand('u1'))).resolves.toBe(
      result,
    );
    expect(cart.clear).toHaveBeenCalledWith('u1');
  });

  it('GetCartHandler delegates to CartService.get', async () => {
    const cart = createServiceMock();
    const result = { userId: 'u1', items: [], total: 0 };
    cart.get.mockResolvedValue(result);
    const handler = new GetCartHandler(asService(cart));

    await expect(handler.execute(new GetCartQuery('u1'))).resolves.toBe(result);
    expect(cart.get).toHaveBeenCalledWith('u1');
  });
});
