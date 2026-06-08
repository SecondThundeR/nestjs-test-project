import {
  type CreateProductDto,
  RpcErrors,
  type UpdateProductDto,
} from '@app/contracts';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';
import { ProductEntity } from './entities/product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly products: Repository<ProductEntity>,
  ) {}

  create(dto: CreateProductDto) {
    const product = this.products.create({
      id: randomUUID(),
      name: dto.name,
      description: dto.description ?? '',
      price: dto.price,
      stock: dto.stock ?? 0,
    });

    return this.products.save(product);
  }

  findAll() {
    return this.products.find();
  }

  async findOne(id: string) {
    const product = await this.products.findOneBy({ id });
    if (!product) {
      throw RpcErrors.notFound(`Product ${id} not found`);
    }
    return product;
  }

  findMany(ids: string[]) {
    if (!ids.length) {
      return Promise.resolve([]);
    }
    return this.products.findBy({ id: In(ids) });
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.findOne(id);
    const newProduct = {
      ...product,
      ...dto,
    };
    return this.products.save(newProduct);
  }

  async remove(id: string) {
    const { affected } = await this.products.delete(id);
    if (!affected) {
      throw RpcErrors.notFound(`Product ${id} not found`);
    }
    return { id, deleted: true };
  }
}
