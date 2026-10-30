import { randomUUID } from 'node:crypto';

import { CacheService } from '@app/cache';
import {
  type ReserveStockDto,
  type ReleaseStockDto,
  reserveStockSchema,
  releaseStockSchema,
  type CreateProductDto,
  ProductDeleteResult,
  type UpdateProductDto,
} from '@app/domains';
import { RpcErrors } from '@app/filters';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { StockReservationEntity } from './entities/stock-reservation.entity.js';
import { ProductEntity } from './entities/product.entity.js';

const LIST_CACHE_KEY = 'products:all';

function productCacheKey(id: string): string {
  return `product:${id}`;
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(ProductEntity)
    private readonly products: Repository<ProductEntity>,
    private readonly cache: CacheService,
  ) {}

  async reserveStock(input: ReserveStockDto): Promise<{ success: true }> {
    const dto = reserveStockSchema.parse(input);
    const items = [...dto.items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    );
    await this.products.manager.transaction(async (manager) => {
      const reservations = manager.getRepository(StockReservationEntity);
      await reservations
        .createQueryBuilder()
        .insert()
        .values({ id: dto.reservationId, items, status: 'pending' })
        .orIgnore()
        .execute();
      const reservation = await reservations.findOneOrFail({
        where: { id: dto.reservationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        reservation.status === 'released' ||
        reservation.items.length !== items.length ||
        reservation.items.some(
          (item, index) =>
            item.productId !== items[index].productId ||
            item.quantity !== items[index].quantity,
        )
      ) {
        throw RpcErrors.conflict(
          'Reservation was released or has different items',
        );
      }
      if (reservation.status === 'reserved') return;
      for (const item of items) {
        const result = await manager
          .getRepository(ProductEntity)
          .createQueryBuilder()
          .update()
          .set({ stock: () => '"stock" - :quantity' })
          .where('"id" = :id AND "stock" >= :quantity', {
            id: item.productId,
            quantity: item.quantity,
          })
          .execute();
        if (!result.affected)
          throw RpcErrors.badRequest(
            `Product ${item.productId} is unavailable or has insufficient stock`,
          );
      }
      await reservations.update(dto.reservationId, { status: 'reserved' });
    });
    await Promise.all(items.map((item) => this.invalidate(item.productId)));
    return { success: true };
  }

  async releaseStock(input: ReleaseStockDto): Promise<{ success: true }> {
    const dto = releaseStockSchema.parse(input);
    const items = await this.products.manager.transaction(async (manager) => {
      const reservations = manager.getRepository(StockReservationEntity);
      // An absent reservation becomes a tombstone, preventing a late reserve.
      // Legacy orders predate the ledger and supply their original items.
      await reservations
        .createQueryBuilder()
        .insert()
        .values({
          id: dto.reservationId,
          items: dto.legacyItems ?? [],
          status: dto.legacyItems ? 'reserved' : 'released',
        })
        .orIgnore()
        .execute();
      const reservation = await reservations.findOneOrFail({
        where: { id: dto.reservationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (reservation.status !== 'released') {
        for (const item of [...reservation.items].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        )) {
          await manager
            .getRepository(ProductEntity)
            .increment({ id: item.productId }, 'stock', item.quantity);
        }
        await reservations.update(dto.reservationId, { status: 'released' });
      }
      return reservation.items;
    });
    await Promise.all(items.map((item) => this.invalidate(item.productId)));
    return { success: true };
  }

  async create(dto: CreateProductDto): Promise<ProductEntity> {
    const product = this.products.create({
      id: randomUUID(),
      name: dto.name,
      description: dto.description ?? '',
      price: dto.price,
      stock: dto.stock ?? 0,
    });
    const saved = await this.products.save(product);

    await this.cache.del(LIST_CACHE_KEY);

    this.logger.log(`Created product ${saved.id} ("${saved.name}")`);
    return saved;
  }

  async findAll(): Promise<ProductEntity[]> {
    return this.cache.wrap(LIST_CACHE_KEY, async () => {
      const products = await this.products.find();

      this.logger.debug(`Listing ${products.length} product(s)`);
      return products;
    });
  }

  async findOne(id: string): Promise<ProductEntity> {
    return this.cache.wrap(productCacheKey(id), async () => {
      const product = await this.products.findOneBy({ id });

      if (!product) {
        this.logger.warn(`Product ${id} not found`);
        throw RpcErrors.notFound(`Product ${id} not found`);
      }

      this.logger.debug(`Fetched product ${id}`);
      return product;
    });
  }

  async findMany(ids: string[]): Promise<ProductEntity[]> {
    if (!ids.length) {
      return [];
    }

    const products = await this.products.findBy({ id: In(ids) });

    this.logger.debug(`Fetched ${products.length}/${ids.length} product(s)`);
    return products;
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductEntity> {
    if (Object.keys(dto).length) {
      const result = await this.products.update(id, dto);
      if (!result.affected) throw RpcErrors.notFound(`Product ${id} not found`);
    }
    const saved = await this.products.findOneBy({ id });
    if (!saved) throw RpcErrors.notFound(`Product ${id} not found`);

    await this.invalidate(id);

    this.logger.log(
      `Updated product ${id} (fields: ${Object.keys(dto).join(', ') || 'none'})`,
    );
    return saved;
  }

  async remove(id: string): Promise<ProductDeleteResult> {
    const { affected } = await this.products.delete(id);

    if (!affected) {
      this.logger.warn(`Cannot remove product ${id}: not found`);
      throw RpcErrors.notFound(`Product ${id} not found`);
    }

    await this.invalidate(id);

    this.logger.log(`Removed product ${id}`);
    return { id, deleted: true };
  }

  private invalidate(id: string): Promise<void> {
    return this.cache.del([productCacheKey(id), LIST_CACHE_KEY]);
  }
}
