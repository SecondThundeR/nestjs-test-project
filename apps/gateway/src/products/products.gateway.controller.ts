import {
  type CreateProductDto,
  type Product,
  PRODUCT_PATTERNS,
  SERVICE_NAMES,
  type UpdateProductDto,
} from '@app/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { rpcSend } from '../common/rpc.util';

@Controller('product')
export class ProductsGatewayController {
  constructor(
    @Inject(SERVICE_NAMES.PRODUCTS) private readonly products: ClientProxy,
  ) {}

  @Post()
  create(@Body() dto: CreateProductDto) {
    return rpcSend<Product>(this.products, PRODUCT_PATTERNS.CREATE, dto);
  }

  @Get()
  findAll() {
    return rpcSend<Product[]>(this.products, PRODUCT_PATTERNS.FIND_ALL, {});
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return rpcSend<Product>(this.products, PRODUCT_PATTERNS.FIND_ONE, id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return rpcSend<Product>(this.products, PRODUCT_PATTERNS.UPDATE, {
      id,
      data: dto,
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return rpcSend<{ id: string; deleted: true }>(
      this.products,
      PRODUCT_PATTERNS.REMOVE,
      id,
    );
  }
}
