import {
  CreateOrderDto,
  Order,
  ORDERS_PATTERNS,
  SERVICE_NAMES,
  UpdateOrderStatusDto,
} from '@app/contracts';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { UserId } from '../common/user-id.decorator';
import { rpcSend } from '../common/rpc.util';

@Controller('orders')
export class OrdersGatewayController {
  constructor(
    @Inject(SERVICE_NAMES.ORDERS) private readonly orders: ClientProxy,
  ) {}

  @Post()
  create(@UserId() userId: string, @Body() dto: CreateOrderDto) {
    return rpcSend<Order>(this.orders, ORDERS_PATTERNS.CREATE, {
      userId,
      shippingAddress: dto.shippingAddress,
    });
  }

  @Get()
  findAll(@UserId() userId: string) {
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
}
