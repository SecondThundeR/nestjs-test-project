import {
  type AddCartItemPayload,
  CART_PATTERNS,
  ORDER_EVENTS,
  type OrderCreatedEventPayload,
  type RemoveCartItemPayload,
  type UpdateCartItemPayload,
} from '@app/domains';
import { Controller } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  EventPattern,
  MessagePattern,
  Payload,
  Transport,
} from '@nestjs/microservices';

import {
  AddCartItemCommand,
  ClearCartCommand,
  RemoveCartItemCommand,
  UpdateCartItemCommand,
} from './cqrs/commands';
import { GetCartQuery } from './cqrs/queries';

@Controller()
export class CartController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @MessagePattern(CART_PATTERNS.GET, Transport.TCP)
  get(@Payload() userId: string) {
    return this.queryBus.execute(new GetCartQuery(userId));
  }

  @MessagePattern(CART_PATTERNS.ADD_ITEM, Transport.TCP)
  addItem(@Payload() payload: AddCartItemPayload) {
    return this.commandBus.execute(
      new AddCartItemCommand(payload.userId, payload.item),
    );
  }

  @MessagePattern(CART_PATTERNS.UPDATE_ITEM, Transport.TCP)
  updateItem(@Payload() payload: UpdateCartItemPayload) {
    return this.commandBus.execute(
      new UpdateCartItemCommand(
        payload.userId,
        payload.productId,
        payload.quantity,
      ),
    );
  }

  @MessagePattern(CART_PATTERNS.REMOVE_ITEM, Transport.TCP)
  removeItem(@Payload() payload: RemoveCartItemPayload) {
    return this.commandBus.execute(
      new RemoveCartItemCommand(payload.userId, payload.productId),
    );
  }

  @MessagePattern(CART_PATTERNS.CLEAR, Transport.TCP)
  clear(@Payload() userId: string) {
    return this.commandBus.execute(new ClearCartCommand(userId));
  }

  @EventPattern(ORDER_EVENTS.CREATED, Transport.KAFKA)
  onOrderCreated(@Payload() event: OrderCreatedEventPayload) {
    return this.commandBus.execute(new ClearCartCommand(event.userId));
  }
}
