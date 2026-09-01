import { SERVICE_NAMES } from '@app/config';
import {
  AddCartItemDto,
  type Cart,
  CART_PATTERNS,
  UpdateCartItemDto,
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
  get(@CurrentUserId() userId: string) {
    return rpcSend<Cart>(this.cart, CART_PATTERNS.GET, userId);
  }

  @Post('items')
  addItem(@CurrentUserId() userId: string, @Body() dto: AddCartItemDto) {
    return rpcSend<Cart>(this.cart, CART_PATTERNS.ADD_ITEM, {
      userId,
      item: dto,
    });
  }

  @Patch('items/:productId')
  updateItem(
    @CurrentUserId() userId: string,
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
  removeItem(
    @CurrentUserId() userId: string,
    @Param('productId') productId: string,
  ) {
    return rpcSend<Cart>(this.cart, CART_PATTERNS.REMOVE_ITEM, {
      userId,
      productId,
    });
  }

  @Delete()
  clear(@CurrentUserId() userId: string) {
    return rpcSend<Cart>(this.cart, CART_PATTERNS.CLEAR, userId);
  }
}
