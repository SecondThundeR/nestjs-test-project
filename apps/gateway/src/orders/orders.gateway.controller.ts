import { SERVICE_NAMES } from '@app/config';
import {
  CreateOrderDto,
  type Order,
  type OrderPayment,
  ORDERS_PATTERNS,
  UpdateOrderStatusDto,
} from '@app/domains';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';

import { CurrentUserId } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { rpcSend } from '../common/rpc.util';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersGatewayController {
  constructor(
    @Inject(SERVICE_NAMES.ORDERS) private readonly orders: ClientProxy,
  ) {}

  @Post()
  create(@CurrentUserId() userId: string, @Body() dto: CreateOrderDto) {
    return rpcSend<Order>(this.orders, ORDERS_PATTERNS.CREATE, {
      userId,
      shippingAddress: dto.shippingAddress,
    });
  }

  @Get()
  findAll(@CurrentUserId() userId: string) {
    return rpcSend<Order[]>(this.orders, ORDERS_PATTERNS.FIND_ALL, userId);
  }

  @Get(':id')
  findOne(@CurrentUserId() userId: string, @Param('id') id: string) {
    return rpcSend<Order>(this.orders, ORDERS_PATTERNS.FIND_ONE, {
      id,
      userId,
    });
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return rpcSend<Order>(this.orders, ORDERS_PATTERNS.UPDATE_STATUS, {
      id,
      userId,
      status: dto.status,
    });
  }

  @Patch(':id/cancel')
  cancel(@CurrentUserId() userId: string, @Param('id') id: string) {
    return rpcSend<Order>(this.orders, ORDERS_PATTERNS.CANCEL, { id, userId });
  }

  @Post(':id/pay')
  pay(@CurrentUserId() userId: string, @Param('id') id: string) {
    return rpcSend<OrderPayment>(this.orders, ORDERS_PATTERNS.PAY, {
      id,
      userId,
    });
  }

  @Post(':id/capture')
  capturePayment(@CurrentUserId() userId: string, @Param('id') id: string) {
    return rpcSend<Order>(this.orders, ORDERS_PATTERNS.CAPTURE_PAYMENT, {
      id,
      userId,
    });
  }
}
