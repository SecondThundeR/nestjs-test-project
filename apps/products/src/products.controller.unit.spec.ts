import { expect, it, vi } from 'vitest';
import { ProductsController } from './products.controller.js';
import type { ProductsService } from './products.service.js';

const create = { name: 'Widget', price: 10 };
const reserve = {
  reservationId: 'order',
  items: [{ productId: 'product', quantity: 2 }],
};
const release = { reservationId: 'order' };
const update = { id: 'product', data: { stock: 1 } };

it.each([
  [
    'reserveStock',
    (controller: ProductsController) => controller.reserveStock(reserve),
    [reserve],
  ],
  [
    'releaseStock',
    (controller: ProductsController) => controller.releaseStock(release),
    [release],
  ],
  [
    'create',
    (controller: ProductsController) => controller.create(create),
    [create],
  ],
  ['findAll', (controller: ProductsController) => controller.findAll(), []],
  [
    'findOne',
    (controller: ProductsController) => controller.findOne('product'),
    ['product'],
  ],
  [
    'findMany',
    (controller: ProductsController) => controller.findMany(['product']),
    [['product']],
  ],
  [
    'update',
    (controller: ProductsController) => controller.update(update),
    [update.id, update.data],
  ],
  [
    'remove',
    (controller: ProductsController) => controller.remove('product'),
    ['product'],
  ],
] as const)(
  'forwards %s to ProductsService',
  async (method, dispatch, args) => {
    const invoke = vi.fn().mockResolvedValue('product result');
    const controller = new ProductsController({
      [method]: invoke,
    } as unknown as ProductsService);
    await expect(dispatch(controller)).resolves.toBe('product result');
    expect(invoke).toHaveBeenCalledExactlyOnceWith(...args);
  },
);
