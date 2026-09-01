import {
  type AddCartItemPayload,
  CART_PATTERNS,
  ORDER_EVENTS,
  type OrderCreatedEventPayload,
  type RemoveCartItemPayload,
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
  get(@Payload() userId: string) {
    return this.cartService.get(userId);
  }

  @MessagePattern(CART_PATTERNS.ADD_ITEM, Transport.TCP)
  addItem(@Payload() payload: AddCartItemPayload) {
    return this.cartService.addItem(payload.userId, payload.item);
  }

  @MessagePattern(CART_PATTERNS.UPDATE_ITEM, Transport.TCP)
  updateItem(@Payload() payload: UpdateCartItemPayload) {
    return this.cartService.updateItem(
      payload.userId,
      payload.productId,
      payload.quantity,
    );
  }

  @MessagePattern(CART_PATTERNS.REMOVE_ITEM, Transport.TCP)
  removeItem(@Payload() payload: RemoveCartItemPayload) {
    return this.cartService.removeItem(payload.userId, payload.productId);
  }

  @MessagePattern(CART_PATTERNS.CLEAR, Transport.TCP)
  clear(@Payload() userId: string) {
    return this.cartService.clear(userId);
  }

  @EventPattern(ORDER_EVENTS.CREATED, Transport.KAFKA)
  onOrderCreated(@Payload() event: OrderCreatedEventPayload) {
    return this.cartService.clear(event.userId);
  }
}
