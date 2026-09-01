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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../common/jwt-auth.guard.js';
import { Roles } from '../common/roles.decorator.js';
import { RolesGuard } from '../common/roles.guard.js';
import { rpcSend } from '../common/rpc.util.js';
import { ProductDeleteResponse, ProductResponse } from './product.response.js';

@ApiTags('products')
@Controller('product')
export class ProductsGatewayController {
  constructor(
    @Inject(SERVICE_NAMES.PRODUCTS) private readonly products: ClientProxy,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a product', description: 'Admin only.' })
  @ApiCreatedResponse({ type: ProductResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiForbiddenResponse({ description: 'Caller is not an admin' })
  create(@Body() dto: CreateProductDto) {
    return rpcSend<Product>(this.products, PRODUCT_PATTERNS.CREATE, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all products' })
  @ApiOkResponse({ type: ProductResponse, isArray: true })
  findAll() {
    return rpcSend<Product[]>(this.products, PRODUCT_PATTERNS.FIND_ALL, {});
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by ID' })
  @ApiOkResponse({ type: ProductResponse })
  @ApiNotFoundResponse({ description: 'Product not found' })
  findOne(@Param('id') id: string) {
    return rpcSend<Product>(this.products, PRODUCT_PATTERNS.FIND_ONE, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a product', description: 'Admin only.' })
  @ApiOkResponse({ type: ProductResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiForbiddenResponse({ description: 'Caller is not an admin' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return rpcSend<Product>(this.products, PRODUCT_PATTERNS.UPDATE, {
      id,
      data: dto,
    });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a product', description: 'Admin only.' })
  @ApiOkResponse({ type: ProductDeleteResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiForbiddenResponse({ description: 'Caller is not an admin' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  remove(@Param('id') id: string) {
    return rpcSend<{ id: string; deleted: true }>(
      this.products,
      PRODUCT_PATTERNS.REMOVE,
      id,
    );
  }
}
