import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  PRODUCT_PATTERNS,
  type UpdateProductPayload,
} from '@app/domains';

@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @MessagePattern(PRODUCT_PATTERNS.CREATE)
  create(@Payload() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @MessagePattern(PRODUCT_PATTERNS.FIND_ALL)
  findAll() {
    return this.productsService.findAll();
  }

  @MessagePattern(PRODUCT_PATTERNS.FIND_ONE)
  findOne(@Payload() id: string) {
    return this.productsService.findOne(id);
  }

  @MessagePattern(PRODUCT_PATTERNS.FIND_MANY)
  findMany(@Payload() ids: string[]) {
    return this.productsService.findMany(ids);
  }

  @MessagePattern(PRODUCT_PATTERNS.UPDATE)
  update(@Payload() payload: UpdateProductPayload) {
    return this.productsService.update(payload.id, payload.data);
  }

  @MessagePattern(PRODUCT_PATTERNS.REMOVE)
  remove(@Payload() id: string) {
    return this.productsService.remove(id);
  }
}
