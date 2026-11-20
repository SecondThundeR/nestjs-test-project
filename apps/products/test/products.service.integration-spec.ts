import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheService } from '@app/cache';
import type { CreateProductDto } from '@app/domains';
import { RpcException } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { useRedisTestCaches } from '../../../test/utils/redis.js';
import { usePostgresTestDatabase } from '../../../test/utils/postgresql.js';
import source from '../src/data-source.js';
import { ProductEntity } from '../src/entities/product.entity.js';
import { ProductsService } from '../src/products.service.js';

describe('ProductsService', () => {
  let service: ProductsService;
  const database = usePostgresTestDatabase('products_service', source, [
    'products',
    'stock_reservations',
  ]);
  const cache = useRedisTestCaches('products-service', 'products');

  beforeEach(async () => {
    const { service: cacheService } = cache('products');

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: getRepositoryToken(ProductEntity),
          useValue: database().getRepository(ProductEntity),
        },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    service = moduleRef.get(ProductsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

      await expect(service.findOne(product.id)).resolves.toEqual(product);
    });
  });

  describe('findAll', () => {
    it('returns an empty array initially', async () => {
      await expect(service.findAll()).resolves.toEqual([]);
    });

    it('returns every created product', async () => {
      const a = await create({ name: 'Alpha' });
      const b = await create({ name: 'Beta' });

      const products = await service.findAll();
      expect(products).toHaveLength(2);
      expect(products).toEqual(expect.arrayContaining([a, b]));
    });
  });

  describe('findOne', () => {
    it('returns the product for a known id', async () => {
      const product = await create();

      await expect(service.findOne(product.id)).resolves.toEqual(product);
    });

    it('throws RpcException for an unknown id', async () => {
      await expect(service.findOne('missing')).rejects.toThrow(RpcException);
    });
  });

  describe('findMany', () => {
    it('returns only the products that exist, skipping unknown ids', async () => {
      const a = await create({ name: 'Alpha' });
      const b = await create({ name: 'Beta' });

      const products = await service.findMany([a.id, 'missing', b.id]);
      expect(products).toHaveLength(2);
      expect(products).toEqual(expect.arrayContaining([a, b]));
    });

    it('returns an empty array when none match', async () => {
      await expect(service.findMany(['missing'])).resolves.toEqual([]);
    });

    it('returns an empty array without querying when given no ids', async () => {
      await expect(service.findMany([])).resolves.toEqual([]);
    });
  });

  describe('update', () => {
    it('preserves product fields when the update is empty', async () => {
      const product = await create({ description: 'A widget', stock: 3 });

      const updated = await service.update(product.id, {});

      expect(updated).toMatchObject({
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        stock: product.stock,
      });
      await expect(service.findOne(product.id)).resolves.toEqual(updated);
    });

    it('merges the provided fields and persists them', async () => {
      const product = await create({ price: 10, stock: 3 });

      const updated = await service.update(product.id, { price: 12 });

      expect(updated).toMatchObject({ price: 12, stock: 3 });
      await expect(service.findOne(product.id)).resolves.toEqual(updated);
    });

    it('rejects an empty patch for an unknown product', async () => {
      await expect(service.update('missing', {})).rejects.toThrow(
        'Product missing not found',
      );
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
        database().getRepository(ProductEntity),
        'findOneBy',
      );

      await service.findOne(product.id);
      await service.findOne(product.id);

      expect(spy).toHaveBeenCalledTimes(1);
      await expect(
        cache('products').manager.get(`product:${product.id}`),
      ).resolves.toBeDefined();
    });

    it('serves a repeated findAll from the cache', async () => {
      await create();
      const spy = vi.spyOn(database().getRepository(ProductEntity), 'find');

      await service.findAll();
      await service.findAll();

      expect(spy).toHaveBeenCalledTimes(1);
      await expect(
        cache('products').manager.get('products:all'),
      ).resolves.toBeDefined();
    });

    it('evicts the listing cache when a product is created', async () => {
      await service.findAll();
      await expect(
        cache('products').manager.get('products:all'),
      ).resolves.toBeDefined();

      await create();

      await expect(
        cache('products').manager.get('products:all'),
      ).resolves.toBeUndefined();
    });

    it('evicts the product cache when it is updated', async () => {
      const product = await create({ price: 10 });
      await service.findOne(product.id);

      await service.update(product.id, { price: 99 });

      await expect(
        cache('products').manager.get(`product:${product.id}`),
      ).resolves.toBeUndefined();
      await expect(service.findOne(product.id)).resolves.toMatchObject({
        price: 99,
      });
    });

    it('evicts the product cache when it is removed', async () => {
      const product = await create();
      await service.findOne(product.id);

      await service.remove(product.id);

      await expect(
        cache('products').manager.get(`product:${product.id}`),
      ).resolves.toBeUndefined();
    });
  });
});
