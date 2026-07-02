import {
  CommandHandler,
  type ICommandHandler,
  IQueryHandler,
  QueryHandler,
} from '@nestjs/cqrs';

import { OrdersService } from '../orders.service';
import {
  CancelOrderCommand,
  CaptureByPaymentIdCommand,
  CapturePaymentCommand,
  CreateOrderCommand,
  PayOrderCommand,
  UpdateOrderStatusCommand,
} from './commands';
import { FindAllOrdersQuery, FindOneOrderQuery } from './queries';

@CommandHandler(CreateOrderCommand)
export class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
  constructor(private readonly orders: OrdersService) {}

  execute({ userId, shippingAddress }: CreateOrderCommand) {
    return this.orders.create(userId, shippingAddress);
  }
}

@CommandHandler(UpdateOrderStatusCommand)
export class UpdateOrderStatusHandler implements ICommandHandler<UpdateOrderStatusCommand> {
  constructor(private readonly orders: OrdersService) {}

  execute({ id, status }: UpdateOrderStatusCommand) {
    return this.orders.updateStatus(id, status);
  }
}

@CommandHandler(CancelOrderCommand)
export class CancelOrderHandler implements ICommandHandler<CancelOrderCommand> {
  constructor(private readonly orders: OrdersService) {}

  execute({ id, userId }: CancelOrderCommand) {
    return this.orders.cancel(id, userId);
  }
}

@CommandHandler(PayOrderCommand)
export class PayOrderHandler implements ICommandHandler<PayOrderCommand> {
  constructor(private readonly orders: OrdersService) {}

  execute({ id, userId }: PayOrderCommand) {
    return this.orders.pay(id, userId);
  }
}

@CommandHandler(CapturePaymentCommand)
export class CapturePaymentHandler implements ICommandHandler<CapturePaymentCommand> {
  constructor(private readonly orders: OrdersService) {}

  execute({ id, userId }: CapturePaymentCommand) {
    return this.orders.capturePayment(id, userId);
  }
}

@CommandHandler(CaptureByPaymentIdCommand)
export class CaptureByPaymentIdHandler implements ICommandHandler<CaptureByPaymentIdCommand> {
  constructor(private readonly orders: OrdersService) {}

  execute({ paymentId }: CaptureByPaymentIdCommand) {
    return this.orders.captureByPaymentId(paymentId);
  }
}

@QueryHandler(FindAllOrdersQuery)
export class FindAllOrdersHandler implements IQueryHandler<FindAllOrdersQuery> {
  constructor(private readonly orders: OrdersService) {}

  execute({ userId }: FindAllOrdersQuery) {
    return this.orders.findAll(userId);
  }
}

@QueryHandler(FindOneOrderQuery)
export class FindOneOrderHandler implements IQueryHandler<FindOneOrderQuery> {
  constructor(private readonly orders: OrdersService) {}

  execute({ id, userId }: FindOneOrderQuery) {
    return this.orders.findOne(id, userId);
  }
}

export const ordersHandlers = [
  CreateOrderHandler,
  UpdateOrderStatusHandler,
  CancelOrderHandler,
  PayOrderHandler,
  CapturePaymentHandler,
  CaptureByPaymentIdHandler,
  FindAllOrdersHandler,
  FindOneOrderHandler,
];
