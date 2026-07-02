import type { ProductsService } from '../products.service';
import {
  CreateProductCommand,
  RemoveProductCommand,
  UpdateProductCommand,
} from './commands';
import {
  CreateProductHandler,
  FindAllProductsHandler,
  FindManyProductsHandler,
  FindOneProductHandler,
  RemoveProductHandler,
  UpdateProductHandler,
} from './handlers';
import { FindManyProductsQuery, FindOneProductQuery } from './queries';

function createServiceMock() {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
}

type ProductsServiceMock = ReturnType<typeof createServiceMock>;

function asService(mock: ProductsServiceMock): ProductsService {
  return mock as unknown as ProductsService;
}

describe('products cqrs handlers', () => {
  it('CreateProductHandler delegates to ProductsService.create', async () => {
    const products = createServiceMock();
    const result = { id: '1' };
    products.create.mockResolvedValue(result);
    const handler = new CreateProductHandler(asService(products));

    const dto = { name: 'Widget', price: 10 } as never;
    await expect(handler.execute(new CreateProductCommand(dto))).resolves.toBe(
      result,
    );
    expect(products.create).toHaveBeenCalledWith(dto);
  });

  it('UpdateProductHandler delegates to ProductsService.update', async () => {
    const products = createServiceMock();
    const result = { id: '1', price: 12 };
    products.update.mockResolvedValue(result);
    const handler = new UpdateProductHandler(asService(products));

    const data = { price: 12 } as never;
    await expect(
      handler.execute(new UpdateProductCommand('1', data)),
    ).resolves.toBe(result);
    expect(products.update).toHaveBeenCalledWith('1', data);
  });

  it('RemoveProductHandler delegates to ProductsService.remove', async () => {
    const products = createServiceMock();
    const result = { id: '1', deleted: true };
    products.remove.mockResolvedValue(result);
    const handler = new RemoveProductHandler(asService(products));

    await expect(handler.execute(new RemoveProductCommand('1'))).resolves.toBe(
      result,
    );
    expect(products.remove).toHaveBeenCalledWith('1');
  });

  it('FindAllProductsHandler delegates to ProductsService.findAll', async () => {
    const products = createServiceMock();
    const result = [{ id: '1' }];
    products.findAll.mockResolvedValue(result);
    const handler = new FindAllProductsHandler(asService(products));

    await expect(handler.execute()).resolves.toBe(result);
    expect(products.findAll).toHaveBeenCalledWith();
  });

  it('FindOneProductHandler delegates to ProductsService.findOne', async () => {
    const products = createServiceMock();
    const result = { id: '1' };
    products.findOne.mockResolvedValue(result);
    const handler = new FindOneProductHandler(asService(products));

    await expect(handler.execute(new FindOneProductQuery('1'))).resolves.toBe(
      result,
    );
    expect(products.findOne).toHaveBeenCalledWith('1');
  });

  it('FindManyProductsHandler delegates to ProductsService.findMany', async () => {
    const products = createServiceMock();
    const result = [{ id: '1' }, { id: '2' }];
    products.findMany.mockResolvedValue(result);
    const handler = new FindManyProductsHandler(asService(products));

    await expect(
      handler.execute(new FindManyProductsQuery(['1', '2'])),
    ).resolves.toBe(result);
    expect(products.findMany).toHaveBeenCalledWith(['1', '2']);
  });
});
