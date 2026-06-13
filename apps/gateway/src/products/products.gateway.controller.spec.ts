import { authConfig, SERVICE_NAMES } from '@app/config';
import {
  type CreateProductDto,
  PRODUCT_PATTERNS,
  type UpdateProductDto,
} from '@app/domains';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';

import { ProductsGatewayController } from './products.gateway.controller';

describe('ProductsGatewayController', () => {
  let controller: ProductsGatewayController;
  let products: { send: jest.Mock };

  beforeEach(async () => {
    products = { send: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: authConfig().secret })],
      controllers: [ProductsGatewayController],
      providers: [
        { provide: SERVICE_NAMES.PRODUCTS, useValue: products },
        { provide: SERVICE_NAMES.AUTH, useValue: { send: jest.fn() } },
      ],
    }).compile();

    controller = moduleRef.get(ProductsGatewayController);
  });

  it('forwards create() as a CREATE message with the dto', async () => {
    const dto: CreateProductDto = { name: 'Widget', price: 10 };
    const result = { id: 'p-1' };
    products.send.mockReturnValue(of(result));

    await expect(controller.create(dto)).resolves.toBe(result);
    expect(products.send).toHaveBeenCalledWith(PRODUCT_PATTERNS.CREATE, dto);
  });

  it('forwards findAll() as a FIND_ALL message', async () => {
    const result = [{ id: 'p-1' }];
    products.send.mockReturnValue(of(result));

    await expect(controller.findAll()).resolves.toBe(result);
    expect(products.send).toHaveBeenCalledWith(PRODUCT_PATTERNS.FIND_ALL, {});
  });

  it('forwards findOne() as a FIND_ONE message with the id', async () => {
    const result = { id: 'p-1' };
    products.send.mockReturnValue(of(result));

    await expect(controller.findOne('p-1')).resolves.toBe(result);
    expect(products.send).toHaveBeenCalledWith(
      PRODUCT_PATTERNS.FIND_ONE,
      'p-1',
    );
  });

  it('forwards update() as an UPDATE message with id and data', async () => {
    const dto: UpdateProductDto = { price: 12 };
    const result = { id: 'p-1', price: 12 };
    products.send.mockReturnValue(of(result));

    await expect(controller.update('p-1', dto)).resolves.toBe(result);
    expect(products.send).toHaveBeenCalledWith(PRODUCT_PATTERNS.UPDATE, {
      id: 'p-1',
      data: dto,
    });
  });

  it('forwards remove() as a REMOVE message with the id', async () => {
    const result = { id: 'p-1', deleted: true };
    products.send.mockReturnValue(of(result));

    await expect(controller.remove('p-1')).resolves.toBe(result);
    expect(products.send).toHaveBeenCalledWith(PRODUCT_PATTERNS.REMOVE, 'p-1');
  });
});
