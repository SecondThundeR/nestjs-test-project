import {
  type CreateProductDto,
  createProductSchema,
  idListSchema,
  idSchema,
  PRODUCT_PATTERNS,
  type UpdateProductPayload,
  updateProductPayloadSchema,
} from '@app/domains';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { ProductsService } from './products.service.js';

@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @MessagePattern(PRODUCT_PATTERNS.CREATE)
  create(@Payload({ schema: createProductSchema }) dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @MessagePattern(PRODUCT_PATTERNS.FIND_ALL)
  findAll() {
    return this.productsService.findAll();
  }

  @MessagePattern(PRODUCT_PATTERNS.FIND_ONE)
  findOne(@Payload({ schema: idSchema }) id: string) {
    return this.productsService.findOne(id);
  }

  @MessagePattern(PRODUCT_PATTERNS.FIND_MANY)
  findMany(@Payload({ schema: idListSchema }) ids: string[]) {
    return this.productsService.findMany(ids);
  }

  @MessagePattern(PRODUCT_PATTERNS.UPDATE)
  update(
    @Payload({ schema: updateProductPayloadSchema })
    payload: UpdateProductPayload,
  ) {
    return this.productsService.update(payload.id, payload.data);
  }

  @MessagePattern(PRODUCT_PATTERNS.REMOVE)
  remove(@Payload({ schema: idSchema }) id: string) {
    return this.productsService.remove(id);
  }
}
