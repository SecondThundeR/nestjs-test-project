import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { type CreateProductDto } from '@app/contracts';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [ProductsService],
    }).compile();

    service = moduleRef.get(ProductsService);
  });

  function create(overrides: Partial<CreateProductDto> = {}) {
    return service.create({ name: 'Widget', price: 10, ...overrides });
  }

  describe('create', () => {
    it('creates a product with a generated id and timestamps', () => {
      const product = create();

      expect(product).toMatchObject({ name: 'Widget', price: 10 });
      expect(typeof product.id).toBe('string');
      expect(product.createdAt).toBe(product.updatedAt);
      expect(typeof product.createdAt).toBe('string');
    });

    it('defaults description to an empty string and stock to 0', () => {
      const product = create();

      expect(product.description).toBe('');
      expect(product.stock).toBe(0);
    });

    it('keeps provided description and stock', () => {
      const product = create({ description: 'A widget', stock: 5 });

      expect(product.description).toBe('A widget');
      expect(product.stock).toBe(5);
    });

    it('stores the product so it can be retrieved', () => {
      const product = create();

      expect(service.findOne(product.id)).toBe(product);
    });
  });

  describe('findAll', () => {
    it('returns an empty array initially', () => {
      expect(service.findAll()).toEqual([]);
    });

    it('returns every created product', () => {
      const a = create({ name: 'Alpha' });
      const b = create({ name: 'Beta' });

      expect(service.findAll()).toEqual([a, b]);
    });
  });

  describe('findOne', () => {
    it('returns the product for a known id', () => {
      const product = create();

      expect(service.findOne(product.id)).toBe(product);
    });

    it('throws NotFoundException for an unknown id', () => {
      expect(() => service.findOne('missing')).toThrow(NotFoundException);
    });
  });

  describe('findMany', () => {
    it('returns only the products that exist, skipping unknown ids', () => {
      const a = create({ name: 'Alpha' });
      const b = create({ name: 'Beta' });

      expect(service.findMany([a.id, 'missing', b.id])).toEqual([a, b]);
    });

    it('returns an empty array when none match', () => {
      expect(service.findMany(['missing'])).toEqual([]);
    });
  });

  describe('update', () => {
    it('merges the provided fields and persists them', () => {
      const product = create({ price: 10, stock: 3 });

      const updated = service.update(product.id, { price: 12 });

      expect(updated).toMatchObject({ price: 12, stock: 3 });
      expect(service.findOne(product.id)).toEqual(updated);
    });

    it('throws NotFoundException for an unknown id', () => {
      expect(() => service.update('missing', { price: 1 })).toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes an existing product', () => {
      const product = create();

      expect(service.remove(product.id)).toEqual({
        id: product.id,
        deleted: true,
      });
      expect(() => service.findOne(product.id)).toThrow(NotFoundException);
    });

    it('throws NotFoundException for an unknown id', () => {
      expect(() => service.remove('missing')).toThrow(NotFoundException);
    });
  });
});
