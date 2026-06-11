import { Controller } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  type CreateOrderPayload,
  ORDERS_PATTERNS,
  type UpdateOrderStatusPayload,
} from '@app/domains';

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
  findOne(@Payload() id: string) {
    return this.ordersService.findOne(id);
  }

  @MessagePattern(ORDERS_PATTERNS.UPDATE_STATUS)
  updateStatus(@Payload() payload: UpdateOrderStatusPayload) {
    return this.ordersService.updateStatus(payload.id, payload.status);
  }

  @MessagePattern(ORDERS_PATTERNS.CANCEL)
  cancel(@Payload() id: string) {
    return this.ordersService.cancel(id);
  }

  @MessagePattern(ORDERS_PATTERNS.PAY)
  pay(@Payload() id: string) {
    return this.ordersService.pay(id);
  }

  @MessagePattern(ORDERS_PATTERNS.CAPTURE_PAYMENT)
  capturePayment(@Payload() id: string) {
    return this.ordersService.capturePayment(id);
  }

  @MessagePattern(ORDERS_PATTERNS.CAPTURE_BY_PAYMENT_ID)
  captureByPaymentId(@Payload() paymentId: string) {
    return this.ordersService.captureByPaymentId(paymentId);
  }
}
