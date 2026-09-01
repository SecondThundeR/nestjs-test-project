import { IsEnum, IsString, MinLength } from 'class-validator';

import { OrderStatus } from './order.interface.js';

export class CreateOrderDto {
  @IsString()
  @MinLength(5)
  shippingAddress!: string;
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}

export interface CreateOrderPayload {
  userId: string;
  shippingAddress: string;
}

export interface OrderActionPayload {
  id: string;
  userId: string;
}

export interface UpdateOrderStatusPayload {
  id: string;
  status: OrderStatus;
}
