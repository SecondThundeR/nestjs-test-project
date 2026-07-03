import type { OrderCreatedEventPayload } from '@app/domains';

import { CartController } from './cart.controller';
import type { CartService } from './cart.service';

describe('CartController', () => {
  it('clears the user cart when an order.created event arrives', async () => {
    const cartService = { clear: jest.fn().mockResolvedValue(undefined) };
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
