import { IsEnum, IsString, MinLength } from 'class-validator';
import { OrderStatus } from './order.interface';

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

export interface UpdateOrderStatusPayload {
  id: string;
  status: OrderStatus;
}
