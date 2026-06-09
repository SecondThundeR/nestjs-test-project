import {
  ProductDeleteResult,
  type CreateProductDto,
  type UpdateProductDto,
} from '@app/domains';
import { RpcErrors } from '@app/filters';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';
import { ProductEntity } from './entities/product.entity';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(ProductEntity)
    private readonly products: Repository<ProductEntity>,
  ) {}

  async create(dto: CreateProductDto): Promise<ProductEntity> {
    const product = this.products.create({
      id: randomUUID(),
      name: dto.name,
      description: dto.description ?? '',
      price: dto.price,
      stock: dto.stock ?? 0,
    });
    const saved = await this.products.save(product);

    this.logger.log(`Created product ${saved.id} ("${saved.name}")`);
    return saved;
  }

  async findAll(): Promise<ProductEntity[]> {
    const products = await this.products.find();

    this.logger.debug(`Listing ${products.length} product(s)`);
    return products;
  }

  async findOne(id: string): Promise<ProductEntity> {
    const product = await this.products.findOneBy({ id });

    if (!product) {
      this.logger.warn(`Product ${id} not found`);
      throw RpcErrors.notFound(`Product ${id} not found`);
    }

    this.logger.debug(`Fetched product ${id}`);
    return product;
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
    const product = await this.findOne(id);
    const newProject = { ...product, ...dto };

    const saved = await this.products.save(newProject);

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

    this.logger.log(`Removed product ${id}`);
    return { id, deleted: true };
  }
}
