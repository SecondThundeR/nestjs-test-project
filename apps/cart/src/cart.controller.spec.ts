import type { OrderCreatedEventPayload } from '@app/domains';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';

import { CartController } from './cart.controller';
import { ClearCartCommand } from './cqrs/commands';

describe('CartController', () => {
  it('clears the user cart when an order.created event arrives', async () => {
    const commandBus = { execute: jest.fn().mockResolvedValue(undefined) };
    const queryBus = { execute: jest.fn() };
    const controller = new CartController(
      commandBus as unknown as CommandBus,
      queryBus as unknown as QueryBus,
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

    expect(commandBus.execute).toHaveBeenCalledWith(new ClearCartCommand('u1'));
  });
});
