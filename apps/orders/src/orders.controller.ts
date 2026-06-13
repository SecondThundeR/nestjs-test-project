import {
  type CreateOrderPayload,
  type OrderActionPayload,
  ORDERS_PATTERNS,
  type UpdateOrderStatusPayload,
} from '@app/domains';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { OrdersService } from './orders.service';

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @MessagePattern(ORDERS_PATTERNS.CREATE)
  create(@Payload() payload: CreateOrderPayload) {
    return this.ordersService.create(payload.userId, payload.shippingAddress);
  }

  @MessagePattern(ORDERS_PATTERNS.FIND_ALL)
  findAll(@Payload() userId?: string) {
    return this.ordersService.findAll(userId);
  }

  @MessagePattern(ORDERS_PATTERNS.FIND_ONE)
  findOne(@Payload() payload: OrderActionPayload) {
    return this.ordersService.findOne(payload.id, payload.userId);
  }

  @MessagePattern(ORDERS_PATTERNS.UPDATE_STATUS)
  updateStatus(@Payload() payload: UpdateOrderStatusPayload) {
    return this.ordersService.updateStatus(
      payload.id,
      payload.status,
      payload.userId,
    );
  }

  @MessagePattern(ORDERS_PATTERNS.CANCEL)
  cancel(@Payload() payload: OrderActionPayload) {
    return this.ordersService.cancel(payload.id, payload.userId);
  }

  @MessagePattern(ORDERS_PATTERNS.PAY)
  pay(@Payload() payload: OrderActionPayload) {
    return this.ordersService.pay(payload.id, payload.userId);
  }

  @MessagePattern(ORDERS_PATTERNS.CAPTURE_PAYMENT)
  capturePayment(@Payload() payload: OrderActionPayload) {
    return this.ordersService.capturePayment(payload.id, payload.userId);
  }

  @MessagePattern(ORDERS_PATTERNS.CAPTURE_BY_PAYMENT_ID)
  captureByPaymentId(@Payload() paymentId: string) {
    return this.ordersService.captureByPaymentId(paymentId);
  }
}
