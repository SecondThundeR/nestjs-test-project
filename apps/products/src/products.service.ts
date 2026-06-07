import { CreateProductDto, Product, UpdateProductDto } from '@app/contracts';
import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

@Injectable()
export class ProductsService {
  private readonly products = new Map<string, Product>();

  create(dto: CreateProductDto) {
    const now = new Date().toISOString();
    const product: Product = {
      id: randomUUID(),
      name: dto.name,
      description: dto.description ?? '',
      price: dto.price,
      stock: dto.stock ?? 0,
      createdAt: now,
      updatedAt: now,
    };

    this.products.set(product.id, product);

    return product;
  }

  findAll() {
    return [...this.products.values()];
  }

  findOne(id: string) {
    const product = this.products.get(id);
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return product;
  }

  findMany(ids: string[]) {
    return ids
      .map((id) => this.products.get(id))
      .filter((p): p is Product => Boolean(p));
  }

  update(id: string, dto: UpdateProductDto) {
    const product = this.findOne(id);
    const updated = {
      ...product,
      ...dto,
    };
    this.products.set(id, updated);
    return updated;
  }

  remove(id: string) {
    if (!this.products.delete(id)) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return { id, deleted: true };
  }
}
