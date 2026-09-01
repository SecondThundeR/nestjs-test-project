import { SERVICE_NAMES } from '@app/config';
import {
  type CreateProductDto,
  createProductSchema,
  idSchema,
  productDeleteResultSchema,
  productSchema,
  type Product,
  PRODUCT_PATTERNS,
  type UpdateProductDto,
  updateProductSchema,
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
  SerializeOptions,
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
  @ApiCreatedResponse({ standardSchema: productSchema })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiForbiddenResponse({ description: 'Caller is not an admin' })
  @SerializeOptions({ schema: productSchema })
  create(@Body({ schema: createProductSchema }) dto: CreateProductDto) {
    return rpcSend<Product>(this.products, PRODUCT_PATTERNS.CREATE, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all products' })
  @ApiOkResponse({ standardSchema: productSchema, isArray: true })
  @SerializeOptions({ schema: productSchema })
  findAll() {
    return rpcSend<Product[]>(this.products, PRODUCT_PATTERNS.FIND_ALL, {});
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by ID' })
  @ApiOkResponse({ standardSchema: productSchema })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @SerializeOptions({ schema: productSchema })
  findOne(@Param('id', { schema: idSchema }) id: string) {
    return rpcSend<Product>(this.products, PRODUCT_PATTERNS.FIND_ONE, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a product', description: 'Admin only.' })
  @ApiOkResponse({ standardSchema: productSchema })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiForbiddenResponse({ description: 'Caller is not an admin' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @SerializeOptions({ schema: productSchema })
  update(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: updateProductSchema }) dto: UpdateProductDto,
  ) {
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
  @ApiOkResponse({ standardSchema: productDeleteResultSchema })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiForbiddenResponse({ description: 'Caller is not an admin' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @SerializeOptions({ schema: productDeleteResultSchema })
  remove(@Param('id', { schema: idSchema }) id: string) {
    return rpcSend<{ id: string; deleted: true }>(
      this.products,
      PRODUCT_PATTERNS.REMOVE,
      id,
    );
  }
}
