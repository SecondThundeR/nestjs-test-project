import {
  createOrderPayloadSchema,
  type CreateOrderPayload,
  idSchema,
  optionalIdSchema,
  orderActionPayloadSchema,
  type OrderActionPayload,
  ORDERS_PATTERNS,
  updateOrderStatusPayloadSchema,
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
} from './cqrs/commands.js';
import { FindAllOrdersQuery, FindOneOrderQuery } from './cqrs/queries.js';

@Controller()
export class OrdersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @MessagePattern(ORDERS_PATTERNS.CREATE)
  create(
    @Payload({ schema: createOrderPayloadSchema }) payload: CreateOrderPayload,
  ) {
    return this.commandBus.execute(
      new CreateOrderCommand(payload.userId, payload.shippingAddress),
    );
  }

  @MessagePattern(ORDERS_PATTERNS.FIND_ALL)
  findAll(@Payload({ schema: optionalIdSchema }) userId?: string) {
    return this.queryBus.execute(new FindAllOrdersQuery(userId));
  }

  @MessagePattern(ORDERS_PATTERNS.FIND_ONE)
  findOne(
    @Payload({ schema: orderActionPayloadSchema }) payload: OrderActionPayload,
  ) {
    return this.queryBus.execute(
      new FindOneOrderQuery(payload.id, payload.userId),
    );
  }

  @MessagePattern(ORDERS_PATTERNS.UPDATE_STATUS)
  updateStatus(
    @Payload({ schema: updateOrderStatusPayloadSchema })
    payload: UpdateOrderStatusPayload,
  ) {
    return this.commandBus.execute(
      new UpdateOrderStatusCommand(payload.id, payload.status),
    );
  }

  @MessagePattern(ORDERS_PATTERNS.CANCEL)
  cancel(
    @Payload({ schema: orderActionPayloadSchema }) payload: OrderActionPayload,
  ) {
    return this.commandBus.execute(
      new CancelOrderCommand(payload.id, payload.userId),
    );
  }

  @MessagePattern(ORDERS_PATTERNS.PAY)
  pay(
    @Payload({ schema: orderActionPayloadSchema }) payload: OrderActionPayload,
  ) {
    return this.commandBus.execute(
      new PayOrderCommand(payload.id, payload.userId),
    );
  }

  @MessagePattern(ORDERS_PATTERNS.CAPTURE_PAYMENT)
  capturePayment(
    @Payload({ schema: orderActionPayloadSchema }) payload: OrderActionPayload,
  ) {
    return this.commandBus.execute(
      new CapturePaymentCommand(payload.id, payload.userId),
    );
  }

  @MessagePattern(ORDERS_PATTERNS.CAPTURE_BY_PAYMENT_ID)
  captureByPaymentId(@Payload({ schema: idSchema }) paymentId: string) {
    return this.commandBus.execute(new CaptureByPaymentIdCommand(paymentId));
  }
}
