import {
  addCartItemPayloadSchema,
  type AddCartItemPayload,
  CART_PATTERNS,
  idSchema,
  ORDER_EVENTS,
  orderCreatedEventPayloadSchema,
  type OrderCreatedEventPayload,
  removeCartItemPayloadSchema,
  type RemoveCartItemPayload,
  updateCartItemPayloadSchema,
  type UpdateCartItemPayload,
} from '@app/domains';
import { Controller } from '@nestjs/common';
import {
  EventPattern,
  MessagePattern,
  Payload,
  Transport,
} from '@nestjs/microservices';

import { CartService } from './cart.service.js';

@Controller()
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @MessagePattern(CART_PATTERNS.GET, Transport.TCP)
  get(@Payload({ schema: idSchema }) userId: string) {
    return this.cartService.get(userId);
  }

  @MessagePattern(CART_PATTERNS.ADD_ITEM, Transport.TCP)
  addItem(
    @Payload({ schema: addCartItemPayloadSchema }) payload: AddCartItemPayload,
  ) {
    return this.cartService.addItem(payload.userId, payload.item);
  }

  @MessagePattern(CART_PATTERNS.UPDATE_ITEM, Transport.TCP)
  updateItem(
    @Payload({ schema: updateCartItemPayloadSchema })
    payload: UpdateCartItemPayload,
  ) {
    return this.cartService.updateItem(
      payload.userId,
      payload.productId,
      payload.quantity,
    );
  }

  @MessagePattern(CART_PATTERNS.REMOVE_ITEM, Transport.TCP)
  removeItem(
    @Payload({ schema: removeCartItemPayloadSchema })
    payload: RemoveCartItemPayload,
  ) {
    return this.cartService.removeItem(payload.userId, payload.productId);
  }

  @MessagePattern(CART_PATTERNS.CLEAR, Transport.TCP)
  clear(@Payload({ schema: idSchema }) userId: string) {
    return this.cartService.clear(userId);
  }

  @EventPattern(ORDER_EVENTS.CREATED, Transport.KAFKA)
  onOrderCreated(
    @Payload({ schema: orderCreatedEventPayloadSchema })
    event: OrderCreatedEventPayload,
  ) {
    return this.cartService.clear(event.userId);
  }
}
