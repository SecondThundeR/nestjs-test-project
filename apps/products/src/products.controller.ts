import {
  CreateProductDto,
  PRODUCT_PATTERNS,
  type UpdateProductPayload,
} from '@app/domains';
import { Controller } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { MessagePattern, Payload } from '@nestjs/microservices';

import {
  CreateProductCommand,
  RemoveProductCommand,
  UpdateProductCommand,
} from './cqrs/commands';
import {
  FindAllProductsQuery,
  FindManyProductsQuery,
  FindOneProductQuery,
} from './cqrs/queries';

@Controller()
export class ProductsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @MessagePattern(PRODUCT_PATTERNS.CREATE)
  create(@Payload() dto: CreateProductDto) {
    return this.commandBus.execute(new CreateProductCommand(dto));
  }

  @MessagePattern(PRODUCT_PATTERNS.FIND_ALL)
  findAll() {
    return this.queryBus.execute(new FindAllProductsQuery());
  }

  @MessagePattern(PRODUCT_PATTERNS.FIND_ONE)
  findOne(@Payload() id: string) {
    return this.queryBus.execute(new FindOneProductQuery(id));
  }

  @MessagePattern(PRODUCT_PATTERNS.FIND_MANY)
  findMany(@Payload() ids: string[]) {
    return this.queryBus.execute(new FindManyProductsQuery(ids));
  }

  @MessagePattern(PRODUCT_PATTERNS.UPDATE)
  update(@Payload() payload: UpdateProductPayload) {
    return this.commandBus.execute(
      new UpdateProductCommand(payload.id, payload.data),
    );
  }

  @MessagePattern(PRODUCT_PATTERNS.REMOVE)
  remove(@Payload() id: string) {
    return this.commandBus.execute(new RemoveProductCommand(id));
  }
}
