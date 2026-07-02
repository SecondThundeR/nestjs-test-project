import {
  type CreateOrderPayload,
  type OrderActionPayload,
  ORDERS_PATTERNS,
  type UpdateOrderStatusPayload,
} from '@app/domains';
import { Controller } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { MessagePattern, Payload } from '@nestjs/microservices';

import {
  CancelOrderCommand,
  CaptureByPaymentIdCommand,
  CapturePaymentCommand,
  CreateOrderCommand,
  PayOrderCommand,
  UpdateOrderStatusCommand,
} from './cqrs/commands';
import { FindAllOrdersQuery, FindOneOrderQuery } from './cqrs/queries';

@Controller()
export class OrdersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @MessagePattern(ORDERS_PATTERNS.CREATE)
  create(@Payload() payload: CreateOrderPayload) {
    return this.commandBus.execute(
      new CreateOrderCommand(payload.userId, payload.shippingAddress),
    );
  }

  @MessagePattern(ORDERS_PATTERNS.FIND_ALL)
  findAll(@Payload() userId?: string) {
    return this.queryBus.execute(new FindAllOrdersQuery(userId));
  }

  @MessagePattern(ORDERS_PATTERNS.FIND_ONE)
  findOne(@Payload() payload: OrderActionPayload) {
    return this.queryBus.execute(
      new FindOneOrderQuery(payload.id, payload.userId),
    );
  }

  @MessagePattern(ORDERS_PATTERNS.UPDATE_STATUS)
  updateStatus(@Payload() payload: UpdateOrderStatusPayload) {
    return this.commandBus.execute(
      new UpdateOrderStatusCommand(payload.id, payload.status),
    );
  }

  @MessagePattern(ORDERS_PATTERNS.CANCEL)
  cancel(@Payload() payload: OrderActionPayload) {
    return this.commandBus.execute(
      new CancelOrderCommand(payload.id, payload.userId),
    );
  }

  @MessagePattern(ORDERS_PATTERNS.PAY)
  pay(@Payload() payload: OrderActionPayload) {
    return this.commandBus.execute(
      new PayOrderCommand(payload.id, payload.userId),
    );
  }

  @MessagePattern(ORDERS_PATTERNS.CAPTURE_PAYMENT)
  capturePayment(@Payload() payload: OrderActionPayload) {
    return this.commandBus.execute(
      new CapturePaymentCommand(payload.id, payload.userId),
    );
  }

  @MessagePattern(ORDERS_PATTERNS.CAPTURE_BY_PAYMENT_ID)
  captureByPaymentId(@Payload() paymentId: string) {
    return this.commandBus.execute(new CaptureByPaymentIdCommand(paymentId));
  }
}
