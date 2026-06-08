import { Test } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import type { CreateProductDto, UpdateProductPayload } from '@app/contracts';

describe('ProductsController', () => {
  let productsController: ProductsController;
  let productsService: jest.Mocked<
    Pick<
      ProductsService,
      'create' | 'findAll' | 'findOne' | 'findMany' | 'update' | 'remove'
    >
  >;

  beforeEach(async () => {
    productsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const app = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: productsService }],
    }).compile();

    productsController = app.get<ProductsController>(ProductsController);
  });

  it('delegates create() to the service with the dto', () => {
    const dto: CreateProductDto = { name: 'Widget', price: 10 };
    const product = {} as never;
    productsService.create.mockReturnValue(product);

    expect(productsController.create(dto)).toBe(product);
    expect(productsService.create).toHaveBeenCalledWith(dto);
  });

  it('delegates findAll() to the service', () => {
    const products = [] as never;
    productsService.findAll.mockReturnValue(products);

    expect(productsController.findAll()).toBe(products);
    expect(productsService.findAll).toHaveBeenCalledWith();
  });

  it('delegates findOne() to the service with the id', () => {
    const product = {} as never;
    productsService.findOne.mockReturnValue(product);

    expect(productsController.findOne('p-1')).toBe(product);
    expect(productsService.findOne).toHaveBeenCalledWith('p-1');
  });

  it('delegates findMany() to the service with the ids', () => {
    const products = [] as never;
    productsService.findMany.mockReturnValue(products);

    expect(productsController.findMany(['p-1', 'p-2'])).toBe(products);
    expect(productsService.findMany).toHaveBeenCalledWith(['p-1', 'p-2']);
  });

  it('delegates update() to the service with id and data', () => {
    const payload: UpdateProductPayload = {
      id: 'p-1',
      data: { price: 12 },
    };
    const product = {} as never;
    productsService.update.mockReturnValue(product);

    expect(productsController.update(payload)).toBe(product);
    expect(productsService.update).toHaveBeenCalledWith('p-1', payload.data);
  });

  it('delegates remove() to the service with the id', () => {
    const result = { id: 'p-1', deleted: true };
    productsService.remove.mockReturnValue(result);

    expect(productsController.remove('p-1')).toBe(result);
    expect(productsService.remove).toHaveBeenCalledWith('p-1');
  });
});
