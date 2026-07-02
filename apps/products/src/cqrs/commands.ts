import type { CreateProductDto, UpdateProductDto } from '@app/domains';

export class CreateProductCommand {
  constructor(public readonly dto: CreateProductDto) {}
}

export class UpdateProductCommand {
  constructor(
    public readonly id: string,
    public readonly data: UpdateProductDto,
  ) {}
}

export class RemoveProductCommand {
  constructor(public readonly id: string) {}
}
