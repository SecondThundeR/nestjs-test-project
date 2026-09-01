import {
  CommandHandler,
  EventBus,
  type ICommandHandler,
  IQueryHandler,
  QueryHandler,
} from '@nestjs/cqrs';

import { OrdersService } from '../orders.service.js';
import {
  CancelOrderCommand,
  CaptureByPaymentIdCommand,
  CapturePaymentCommand,
  CreateOrderCommand,
  PayOrderCommand,
  UpdateOrderStatusCommand,
} from './commands.js';
import {
  OrderCancelledEvent,
  OrderCreatedEvent,
  OrderPaidEvent,
  OrderStatusChangedEvent,
} from './events.js';
import { FindAllOrdersQuery, FindOneOrderQuery } from './queries.js';

@CommandHandler(CreateOrderCommand)
export class CreateOrderHandler implements ICommandHandler<CreateOrderCommand> {
  constructor(
    private readonly orders: OrdersService,
    private readonly eventBus: EventBus,
  ) {}

  async execute({ userId, shippingAddress }: CreateOrderCommand) {
    const order = await this.orders.create(userId, shippingAddress);
    this.eventBus.publish(new OrderCreatedEvent(order));
    return order;
  }
}

@CommandHandler(UpdateOrderStatusCommand)
export class UpdateOrderStatusHandler implements ICommandHandler<UpdateOrderStatusCommand> {
  constructor(
    private readonly orders: OrdersService,
    private readonly eventBus: EventBus,
  ) {}

  async execute({ id, status }: UpdateOrderStatusCommand) {
    const order = await this.orders.updateStatus(id, status);
    this.eventBus.publish(new OrderStatusChangedEvent(order));
    return order;
  }
}

@CommandHandler(CancelOrderCommand)
export class CancelOrderHandler implements ICommandHandler<CancelOrderCommand> {
  constructor(
    private readonly orders: OrdersService,
    private readonly eventBus: EventBus,
  ) {}

  async execute({ id, userId }: CancelOrderCommand) {
    const order = await this.orders.cancel(id, userId);
    this.eventBus.publish(new OrderCancelledEvent(order));
    return order;
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
  constructor(
    private readonly orders: OrdersService,
    private readonly eventBus: EventBus,
  ) {}

  async execute({ id, userId }: CapturePaymentCommand) {
    const order = await this.orders.capturePayment(id, userId);
    this.eventBus.publish(new OrderPaidEvent(order));
    return order;
  }
}

@CommandHandler(CaptureByPaymentIdCommand)
export class CaptureByPaymentIdHandler implements ICommandHandler<CaptureByPaymentIdCommand> {
  constructor(
    private readonly orders: OrdersService,
    private readonly eventBus: EventBus,
  ) {}

  async execute({ paymentId }: CaptureByPaymentIdCommand) {
    const order = await this.orders.captureByPaymentId(paymentId);
    this.eventBus.publish(new OrderPaidEvent(order));
    return order;
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
