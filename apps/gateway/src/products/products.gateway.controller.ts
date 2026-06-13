import { SERVICE_NAMES } from '@app/config';
import {
  CreateProductDto,
  type Product,
  PRODUCT_PATTERNS,
  UpdateProductDto,
  UserRole,
} from '@app/domains';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';

import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { rpcSend } from '../common/rpc.util';

@Controller('product')
export class ProductsGatewayController {
  constructor(
    @Inject(SERVICE_NAMES.PRODUCTS) private readonly products: ClientProxy,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return rpcSend<Product>(this.products, PRODUCT_PATTERNS.UPDATE, {
      id,
      data: dto,
    });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return rpcSend<{ id: string; deleted: true }>(
      this.products,
      PRODUCT_PATTERNS.REMOVE,
      id,
    );
  }
}
