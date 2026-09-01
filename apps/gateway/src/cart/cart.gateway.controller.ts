import { SERVICE_NAMES } from '@app/config';
import {
  type AddCartItemDto,
  addCartItemSchema,
  type Cart,
  CART_PATTERNS,
  cartSchema,
  idSchema,
  type UpdateCartItemDto,
  updateCartItemSchema,
} from '@app/domains';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  SerializeOptions,
  UseGuards,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';

import { CurrentUserId } from '../common/current-user.decorator.js';
import { JwtAuthGuard } from '../common/jwt-auth.guard.js';
import { rpcSend } from '../common/rpc.util.js';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartGatewayController {
  constructor(@Inject(SERVICE_NAMES.CART) private readonly cart: ClientProxy) {}

  @Get()
  @SerializeOptions({ schema: cartSchema })
  get(@CurrentUserId() userId: string) {
    return rpcSend<Cart>(this.cart, CART_PATTERNS.GET, userId);
  }

  @Post('items')
  @SerializeOptions({ schema: cartSchema })
  addItem(
    @CurrentUserId() userId: string,
    @Body({ schema: addCartItemSchema }) dto: AddCartItemDto,
  ) {
    return rpcSend<Cart>(this.cart, CART_PATTERNS.ADD_ITEM, {
      userId,
      item: dto,
    });
  }

  @Patch('items/:productId')
  @SerializeOptions({ schema: cartSchema })
  updateItem(
    @CurrentUserId() userId: string,
    @Param('productId', { schema: idSchema }) productId: string,
    @Body({ schema: updateCartItemSchema }) dto: UpdateCartItemDto,
  ) {
    return rpcSend<Cart>(this.cart, CART_PATTERNS.UPDATE_ITEM, {
      userId,
      productId,
      quantity: dto.quantity,
    });
  }

  @Delete('items/:productId')
  @SerializeOptions({ schema: cartSchema })
  removeItem(
    @CurrentUserId() userId: string,
    @Param('productId', { schema: idSchema }) productId: string,
  ) {
    return rpcSend<Cart>(this.cart, CART_PATTERNS.REMOVE_ITEM, {
      userId,
      productId,
    });
  }

  @Delete()
  @SerializeOptions({ schema: cartSchema })
  clear(@CurrentUserId() userId: string) {
    return rpcSend<Cart>(this.cart, CART_PATTERNS.CLEAR, userId);
  }
}
