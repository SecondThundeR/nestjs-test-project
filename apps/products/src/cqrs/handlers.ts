import {
  CommandHandler,
  type ICommandHandler,
  IQueryHandler,
  QueryHandler,
} from '@nestjs/cqrs';

import { ProductsService } from '../products.service';
import {
  CreateProductCommand,
  RemoveProductCommand,
  UpdateProductCommand,
} from './commands';
import {
  FindAllProductsQuery,
  FindManyProductsQuery,
  FindOneProductQuery,
} from './queries';

@CommandHandler(CreateProductCommand)
export class CreateProductHandler implements ICommandHandler<CreateProductCommand> {
  constructor(private readonly products: ProductsService) {}

  execute({ dto }: CreateProductCommand) {
    return this.products.create(dto);
  }
}

@CommandHandler(UpdateProductCommand)
export class UpdateProductHandler implements ICommandHandler<UpdateProductCommand> {
  constructor(private readonly products: ProductsService) {}

  execute({ id, data }: UpdateProductCommand) {
    return this.products.update(id, data);
  }
}

@CommandHandler(RemoveProductCommand)
export class RemoveProductHandler implements ICommandHandler<RemoveProductCommand> {
  constructor(private readonly products: ProductsService) {}

  execute({ id }: RemoveProductCommand) {
    return this.products.remove(id);
  }
}

@QueryHandler(FindAllProductsQuery)
export class FindAllProductsHandler implements IQueryHandler<FindAllProductsQuery> {
  constructor(private readonly products: ProductsService) {}

  execute() {
    return this.products.findAll();
  }
}

@QueryHandler(FindOneProductQuery)
export class FindOneProductHandler implements IQueryHandler<FindOneProductQuery> {
  constructor(private readonly products: ProductsService) {}

  execute({ id }: FindOneProductQuery) {
    return this.products.findOne(id);
  }
}

@QueryHandler(FindManyProductsQuery)
export class FindManyProductsHandler implements IQueryHandler<FindManyProductsQuery> {
  constructor(private readonly products: ProductsService) {}

  execute({ ids }: FindManyProductsQuery) {
    return this.products.findMany(ids);
  }
}

export const productsHandlers = [
  CreateProductHandler,
  UpdateProductHandler,
  RemoveProductHandler,
  FindAllProductsHandler,
  FindOneProductHandler,
  FindManyProductsHandler,
];
