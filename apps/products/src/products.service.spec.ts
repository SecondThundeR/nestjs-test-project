import { CacheService } from '@app/cache';
import type { CreateProductDto } from '@app/domains';
import { RpcException } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

import { createInMemoryCache } from '../../../test/utils/in-memory-cache.js';
import { createInMemoryDataSource } from '../../../test/utils/in-memory-database.js';
import { ProductEntity } from './entities/product.entity.js';
import { ProductsService } from './products.service.js';

describe('ProductsService', () => {
  let service: ProductsService;
  let dataSource: DataSource;
  let cacheStore: Map<string, unknown>;

  beforeEach(async () => {
    dataSource = await createInMemoryDataSource([ProductEntity]);
    const { service: cacheService, store } = createInMemoryCache();
    cacheStore = store;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: getRepositoryToken(ProductEntity),
          useValue: dataSource.getRepository(ProductEntity),
        },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    service = moduleRef.get(ProductsService);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  function create(overrides: Partial<CreateProductDto> = {}) {
    return service.create({ name: 'Widget', price: 10, ...overrides });
  }

  describe('create', () => {
    it('creates a product with a generated id and timestamps', async () => {
      const product = await create();

      expect(product).toMatchObject({ name: 'Widget', price: 10 });
      expect(typeof product.id).toBe('string');
      expect(product.createdAt).toBe(product.updatedAt);
      expect(typeof product.createdAt).toBe('string');
    });

    it('defaults description to an empty string and stock to 0', async () => {
      const product = await create();

      expect(product.description).toBe('');
      expect(product.stock).toBe(0);
    });

    it('keeps provided description and stock', async () => {
      const product = await create({ description: 'A widget', stock: 5 });

      expect(product.description).toBe('A widget');
      expect(product.stock).toBe(5);
    });

    it('stores the product so it can be retrieved', async () => {
      const product = await create();

      await expect(service.findOne(product.id)).resolves.toStrictEqual(product);
    });
  });

  describe('findAll', () => {
    it('returns an empty array initially', async () => {
      await expect(service.findAll()).resolves.toEqual([]);
    });

    it('returns every created product', async () => {
      const a = await create({ name: 'Alpha' });
      const b = await create({ name: 'Beta' });

      await expect(service.findAll()).resolves.toEqual([a, b]);
    });
  });

  describe('findOne', () => {
    it('returns the product for a known id', async () => {
      const product = await create();

      await expect(service.findOne(product.id)).resolves.toStrictEqual(product);
    });

    it('throws RpcException for an unknown id', async () => {
      await expect(service.findOne('missing')).rejects.toThrow(RpcException);
    });
  });

  describe('findMany', () => {
    it('returns only the products that exist, skipping unknown ids', async () => {
      const a = await create({ name: 'Alpha' });
      const b = await create({ name: 'Beta' });

      await expect(service.findMany([a.id, 'missing', b.id])).resolves.toEqual([
        a,
        b,
      ]);
    });

    it('returns an empty array when none match', async () => {
      await expect(service.findMany(['missing'])).resolves.toEqual([]);
    });

    it('returns an empty array without querying when given no ids', async () => {
      await expect(service.findMany([])).resolves.toEqual([]);
    });
  });

  describe('update', () => {
    it('merges the provided fields and persists them', async () => {
      const product = await create({ price: 10, stock: 3 });

      const updated = await service.update(product.id, { price: 12 });

      expect(updated).toMatchObject({ price: 12, stock: 3 });
      await expect(service.findOne(product.id)).resolves.toEqual(updated);
    });

    it('throws RpcException for an unknown id', async () => {
      await expect(service.update('missing', { price: 1 })).rejects.toThrow(
        RpcException,
      );
    });
  });

  describe('remove', () => {
    it('deletes an existing product', async () => {
      const product = await create();

      await expect(service.remove(product.id)).resolves.toEqual({
        id: product.id,
        deleted: true,
      });
      await expect(service.findOne(product.id)).rejects.toThrow(RpcException);
    });

    it('throws RpcException for an unknown id', async () => {
      await expect(service.remove('missing')).rejects.toThrow(RpcException);
    });
  });

  describe('caching', () => {
    it('serves a repeated findOne from the cache', async () => {
      const product = await create();
      const spy = vi.spyOn(
        dataSource.getRepository(ProductEntity),
        'findOneBy',
      );

      await service.findOne(product.id);
      await service.findOne(product.id);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(cacheStore.has(`product:${product.id}`)).toBe(true);
    });

    it('serves a repeated findAll from the cache', async () => {
      await create();
      const spy = vi.spyOn(dataSource.getRepository(ProductEntity), 'find');

      await service.findAll();
      await service.findAll();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(cacheStore.has('products:all')).toBe(true);
    });

    it('evicts the listing cache when a product is created', async () => {
      await service.findAll();
      expect(cacheStore.has('products:all')).toBe(true);

      await create();

      expect(cacheStore.has('products:all')).toBe(false);
    });

    it('evicts the product cache when it is updated', async () => {
      const product = await create({ price: 10 });
      await service.findOne(product.id);

      await service.update(product.id, { price: 99 });

      expect(cacheStore.has(`product:${product.id}`)).toBe(false);
      await expect(service.findOne(product.id)).resolves.toMatchObject({
        price: 99,
      });
    });

    it('evicts the product cache when it is removed', async () => {
      const product = await create();
      await service.findOne(product.id);

      await service.remove(product.id);

      expect(cacheStore.has(`product:${product.id}`)).toBe(false);
    });
  });
});
