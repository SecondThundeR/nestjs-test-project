import {
  type AddCartItemDto,
  type Cart,
  CART_PATTERNS,
  SERVICE_NAMES,
  type UpdateCartItemDto,
} from '@app/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { UserId } from '../common/user-id.decorator';
import { rpcSend } from '../common/rpc.util';

@Controller('cart')
export class CartGatewayController {
  constructor(@Inject(SERVICE_NAMES.CART) private readonly cart: ClientProxy) {}

  @Get()
  get(@UserId() userId: string) {
    return rpcSend<Cart>(this.cart, CART_PATTERNS.GET, userId);
  }

  @Post('items')
  addItem(@UserId() userId: string, @Body() dto: AddCartItemDto) {
    return rpcSend<Cart>(this.cart, CART_PATTERNS.ADD_ITEM, {
      userId,
      item: dto,
    });
  }

  @Patch('items/:productId')
  updateItem(
    @UserId() userId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return rpcSend<Cart>(this.cart, CART_PATTERNS.UPDATE_ITEM, {
      userId,
      productId,
      quantity: dto.quantity,
    });
  }

  @Delete('items/:productId')
  removeItem(@UserId() userId: string, @Param('productId') productId: string) {
    return rpcSend<Cart>(this.cart, CART_PATTERNS.REMOVE_ITEM, {
      userId,
      productId,
    });
  }

  @Delete()
  clear(@UserId() userId: string) {
    return rpcSend<Cart>(this.cart, CART_PATTERNS.CLEAR, userId);
  }
}
