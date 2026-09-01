import { SERVICE_NAMES } from '@app/config';
import {
  type CreateOrderDto,
  createOrderSchema,
  idSchema,
  type Order,
  orderPaymentSchema,
  orderSchema,
  type OrderPayment,
  ORDERS_PATTERNS,
  type UpdateOrderStatusDto,
  updateOrderStatusSchema,
  UserRole,
} from '@app/domains';
import {
  Body,
  Controller,
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
import { Roles } from '../common/roles.decorator.js';
import { RolesGuard } from '../common/roles.guard.js';
import { rpcSend } from '../common/rpc.util.js';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersGatewayController {
  constructor(
    @Inject(SERVICE_NAMES.ORDERS) private readonly orders: ClientProxy,
  ) {}

  @Post()
  @SerializeOptions({ schema: orderSchema })
  create(
    @CurrentUserId() userId: string,
    @Body({ schema: createOrderSchema }) dto: CreateOrderDto,
  ) {
    return rpcSend<Order>(this.orders, ORDERS_PATTERNS.CREATE, {
      userId,
      shippingAddress: dto.shippingAddress,
    });
  }

  @Get()
  @SerializeOptions({ schema: orderSchema })
  findAll(@CurrentUserId() userId: string) {
    return rpcSend<Order[]>(this.orders, ORDERS_PATTERNS.FIND_ALL, userId);
  }

  @Get(':id')
  @SerializeOptions({ schema: orderSchema })
  findOne(
    @CurrentUserId() userId: string,
    @Param('id', { schema: idSchema }) id: string,
  ) {
    return rpcSend<Order>(this.orders, ORDERS_PATTERNS.FIND_ONE, {
      id,
      userId,
    });
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @SerializeOptions({ schema: orderSchema })
  updateStatus(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: updateOrderStatusSchema }) dto: UpdateOrderStatusDto,
  ) {
    // Only admins can change order status and not regular user that created order
    return rpcSend<Order>(this.orders, ORDERS_PATTERNS.UPDATE_STATUS, {
      id,
      status: dto.status,
    });
  }

  @Patch(':id/cancel')
  @SerializeOptions({ schema: orderSchema })
  cancel(
    @CurrentUserId() userId: string,
    @Param('id', { schema: idSchema }) id: string,
  ) {
    return rpcSend<Order>(this.orders, ORDERS_PATTERNS.CANCEL, { id, userId });
  }

  @Post(':id/pay')
  @SerializeOptions({ schema: orderPaymentSchema })
  pay(
    @CurrentUserId() userId: string,
    @Param('id', { schema: idSchema }) id: string,
  ) {
    return rpcSend<OrderPayment>(this.orders, ORDERS_PATTERNS.PAY, {
      id,
      userId,
    });
  }

  @Post(':id/capture')
  @SerializeOptions({ schema: orderSchema })
  capturePayment(
    @CurrentUserId() userId: string,
    @Param('id', { schema: idSchema }) id: string,
  ) {
    return rpcSend<Order>(this.orders, ORDERS_PATTERNS.CAPTURE_PAYMENT, {
      id,
      userId,
    });
  }
}
