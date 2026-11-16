import type { Cart } from '@app/domains';
import { RpcErrors } from '@app/filters';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoServerError } from 'mongodb';
import { MongoRepository } from 'typeorm';

import { CartSchema, type CartDocument } from './schemas/cart.schema.js';

@Injectable()
export class CartStore {
  constructor(
    @InjectRepository(CartSchema)
    private readonly carts: MongoRepository<CartDocument>,
  ) {}

  async get(userId: string): Promise<Cart | null> {
    const document = await this.carts.findOne({ where: { _id: userId } });

    return document ? this.toCart(document) : null;
  }

  async mutate(
    userId: string,
    create: boolean,
    mutate: (cart: Cart) => void,
  ): Promise<Cart> {
    for (let attempt = 0; attempt < 64; attempt++) {
      const previous = await this.carts.findOne({ where: { _id: userId } });
      if (!previous && !create) throw RpcErrors.notFound('Cart is empty');

      const cart: Cart = previous
        ? this.toCart(previous)
        : {
            userId,
            items: [],
            total: 0,
            updatedAt: new Date().toISOString(),
          };

      mutate(cart);

      cart.updatedAt = new Date().toISOString();

      const next: CartDocument = {
        ...cart,
        _id: userId,
        version: (previous?.version ?? 0) + 1,
      };

      if (previous) {
        const result = await this.carts.replaceOne(
          { _id: userId, version: previous.version },
          next,
        );

        if (result.matchedCount === 1) return cart;
      } else {
        try {
          await this.carts.insertOne(next);
          return cart;
        } catch (error) {
          if (!(error instanceof MongoServerError) || error.code !== 11000)
            throw error;
        }
      }
    }

    throw RpcErrors.conflict(
      'Cart was updated concurrently; retry the request',
    );
  }

  private toCart(document: CartDocument): Cart {
    return {
      userId: document.userId,
      items: document.items,
      total: document.total,
      updatedAt: document.updatedAt,
    };
  }
}
