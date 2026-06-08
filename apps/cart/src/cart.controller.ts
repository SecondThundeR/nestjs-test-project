import { Controller } from '@nestjs/common';
import { CartService } from './cart.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  type AddCartItemPayload,
  CART_PATTERNS,
  type RemoveCartItemPayload,
  type UpdateCartItemPayload,
} from '@app/domains';

@Controller()
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @MessagePattern(CART_PATTERNS.GET)
  get(@Payload() userId: string) {
    return this.cartService.get(userId);
  }

  @MessagePattern(CART_PATTERNS.ADD_ITEM)
  addItem(@Payload() payload: AddCartItemPayload) {
    return this.cartService.addItem(payload.userId, payload.item);
  }

  @MessagePattern(CART_PATTERNS.UPDATE_ITEM)
  updateItem(@Payload() payload: UpdateCartItemPayload) {
    return this.cartService.updateItem(
      payload.userId,
      payload.productId,
      payload.quantity,
    );
  }

  @MessagePattern(CART_PATTERNS.REMOVE_ITEM)
  removeItem(@Payload() payload: RemoveCartItemPayload) {
    return this.cartService.removeItem(payload.userId, payload.productId);
  }

  @MessagePattern(CART_PATTERNS.CLEAR)
  clear(@Payload() userId: string) {
    return this.cartService.clear(userId);
  }
}
