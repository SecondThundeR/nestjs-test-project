import {
  CommandHandler,
  type ICommandHandler,
  IQueryHandler,
  QueryHandler,
} from '@nestjs/cqrs';

import { CartService } from '../cart.service';
import {
  AddCartItemCommand,
  ClearCartCommand,
  RemoveCartItemCommand,
  UpdateCartItemCommand,
} from './commands';
import { GetCartQuery } from './queries';

@CommandHandler(AddCartItemCommand)
export class AddCartItemHandler implements ICommandHandler<AddCartItemCommand> {
  constructor(private readonly cart: CartService) {}

  execute({ userId, item }: AddCartItemCommand) {
    return this.cart.addItem(userId, item);
  }
}

@CommandHandler(UpdateCartItemCommand)
export class UpdateCartItemHandler implements ICommandHandler<UpdateCartItemCommand> {
  constructor(private readonly cart: CartService) {}

  execute({ userId, productId, quantity }: UpdateCartItemCommand) {
    return this.cart.updateItem(userId, productId, quantity);
  }
}

@CommandHandler(RemoveCartItemCommand)
export class RemoveCartItemHandler implements ICommandHandler<RemoveCartItemCommand> {
  constructor(private readonly cart: CartService) {}

  execute({ userId, productId }: RemoveCartItemCommand) {
    return this.cart.removeItem(userId, productId);
  }
}

@CommandHandler(ClearCartCommand)
export class ClearCartHandler implements ICommandHandler<ClearCartCommand> {
  constructor(private readonly cart: CartService) {}

  execute({ userId }: ClearCartCommand) {
    return this.cart.clear(userId);
  }
}

@QueryHandler(GetCartQuery)
export class GetCartHandler implements IQueryHandler<GetCartQuery> {
  constructor(private readonly cart: CartService) {}

  execute({ userId }: GetCartQuery) {
    return this.cart.get(userId);
  }
}

export const cartHandlers = [
  AddCartItemHandler,
  UpdateCartItemHandler,
  RemoveCartItemHandler,
  ClearCartHandler,
  GetCartHandler,
];
