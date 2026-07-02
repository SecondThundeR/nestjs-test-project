import {
  type AddCartItemPayload,
  CART_PATTERNS,
  type RemoveCartItemPayload,
  type UpdateCartItemPayload,
} from '@app/domains';
import { Controller } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { MessagePattern, Payload } from '@nestjs/microservices';

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

  @MessagePattern(CART_PATTERNS.GET)
  get(@Payload() userId: string) {
    return this.queryBus.execute(new GetCartQuery(userId));
  }

  @MessagePattern(CART_PATTERNS.ADD_ITEM)
  addItem(@Payload() payload: AddCartItemPayload) {
    return this.commandBus.execute(
      new AddCartItemCommand(payload.userId, payload.item),
    );
  }

  @MessagePattern(CART_PATTERNS.UPDATE_ITEM)
  updateItem(@Payload() payload: UpdateCartItemPayload) {
    return this.commandBus.execute(
      new UpdateCartItemCommand(
        payload.userId,
        payload.productId,
        payload.quantity,
      ),
    );
  }

  @MessagePattern(CART_PATTERNS.REMOVE_ITEM)
  removeItem(@Payload() payload: RemoveCartItemPayload) {
    return this.commandBus.execute(
      new RemoveCartItemCommand(payload.userId, payload.productId),
    );
  }

  @MessagePattern(CART_PATTERNS.CLEAR)
  clear(@Payload() userId: string) {
    return this.commandBus.execute(new ClearCartCommand(userId));
  }
}
