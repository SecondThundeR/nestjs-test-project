import type { AddCartItemDto } from '@app/domains';

export class AddCartItemCommand {
  constructor(
    public readonly userId: string,
    public readonly item: AddCartItemDto,
  ) {}
}

export class UpdateCartItemCommand {
  constructor(
    public readonly userId: string,
    public readonly productId: string,
    public readonly quantity: number,
  ) {}
}

export class RemoveCartItemCommand {
  constructor(
    public readonly userId: string,
    public readonly productId: string,
  ) {}
}

export class ClearCartCommand {
  constructor(public readonly userId: string) {}
}
