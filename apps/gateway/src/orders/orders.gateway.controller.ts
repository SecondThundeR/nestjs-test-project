import {
  CreateOrderDto,
  type Order,
  type OrderPayment,
  ORDERS_PATTERNS,
  UpdateOrderStatusDto,
} from '@app/domains';
import { SERVICE_NAMES } from '@app/config';
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
  findOne(@Param('id') id: string) {
    return rpcSend<Order>(this.orders, ORDERS_PATTERNS.FIND_ONE, id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return rpcSend<Order>(this.orders, ORDERS_PATTERNS.UPDATE_STATUS, {
      id,
      status: dto.status,
    });
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return rpcSend<Order>(this.orders, ORDERS_PATTERNS.CANCEL, id);
  }

  @Post(':id/pay')
  pay(@Param('id') id: string) {
    return rpcSend<OrderPayment>(this.orders, ORDERS_PATTERNS.PAY, id);
  }

  @Post(':id/capture')
  capturePayment(@Param('id') id: string) {
    return rpcSend<Order>(this.orders, ORDERS_PATTERNS.CAPTURE_PAYMENT, id);
  }
}
