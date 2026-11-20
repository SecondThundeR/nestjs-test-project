import { describe, expect, it, vi } from 'vitest';
import type { OrderCreatedEventPayload } from '@app/domains';

import { CartController } from './cart.controller.js';
import type { CartService } from './cart.service.js';

describe('CartController', () => {
  it('clears the user cart when an order.created event arrives', async () => {
    const cartService = { clear: vi.fn().mockResolvedValue(undefined) };
    const controller = new CartController(
      cartService as unknown as CartService,
    );

    const event: OrderCreatedEventPayload = {
      orderId: 'o1',
      userId: 'u1',
      total: 20,
      items: [
        {
          productId: 'p1',
          name: 'Widget',
          price: 10,
          quantity: 2,
          subtotal: 20,
        },
      ],
    };

    await controller.onOrderCreated(event);

    expect(cartService.clear).toHaveBeenCalledWith('u1');
  });
});

const payload = { userId: 'buyer', productId: 'product', quantity: 2 };
const item = { productId: payload.productId, quantity: payload.quantity };

it.each([
  [
    'get',
    (controller: CartController) => controller.get(payload.userId),
    [payload.userId],
  ],
  [
    'clear',
    (controller: CartController) => controller.clear(payload.userId),
    [payload.userId],
  ],
  [
    'addItem',
    (controller: CartController) =>
      controller.addItem({ userId: payload.userId, item }),
    [payload.userId, item],
  ],
  [
    'updateItem',
    (controller: CartController) => controller.updateItem(payload),
    [payload.userId, payload.productId, payload.quantity],
  ],
  [
    'removeItem',
    (controller: CartController) => controller.removeItem(payload),
    [payload.userId, payload.productId],
  ],
] as const)(
  'forwards %s with the user scope and item data',
  async (method, dispatch, args) => {
    const execute = vi.fn().mockResolvedValue('cart result');
    const controller = new CartController({
      [method]: execute,
    } as unknown as CartService);
    await expect(dispatch(controller)).resolves.toBe('cart result');
    expect(execute).toHaveBeenCalledExactlyOnceWith(...args);
  },
);
