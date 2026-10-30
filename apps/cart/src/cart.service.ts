import { SERVICE_NAMES } from '@app/config';
import {
  AddCartItemDto,
  type Cart,
  type Product,
  PRODUCT_PATTERNS,
} from '@app/domains';
import { RpcErrors } from '@app/filters';
import { roundPrice } from '@app/utils';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';

import { CartEventsPublisher } from './cart-events.publisher.js';

import { CartSchema } from './schemas/cart.schema.js';

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    @InjectRepository(CartSchema)
    private readonly carts: Repository<Cart>,
    @Inject(SERVICE_NAMES.PRODUCTS)
    private readonly productsClient: ClientProxy,
    private readonly events: CartEventsPublisher,
  ) {}

  async get(userId: string): Promise<Cart> {
    const cart = await this.carts.findOneBy({ userId });
    this.logger.debug(
      `Cart for user ${userId} has ${cart?.items.length ?? 0} item(s)`,
    );
    return cart ?? this.createEmptyCart(userId);
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<Cart> {
    this.logger.log(
      `User ${userId} adding ${dto.quantity}x product ${dto.productId} to cart`,
    );

    const product = await this.fetchProduct(dto.productId);
    return this.mutateCart(userId, true, (cart) => {
      const existing = cart.items.find(
        ({ productId }) => productId === product.id,
      );
      const nextQuantity = (existing?.quantity ?? 0) + dto.quantity;

      if (product.stock < nextQuantity) {
        this.logger.warn(
          `Rejected add for user ${userId}: only ${product.stock} of "${product.name}" in stock (requested ${nextQuantity})`,
        );
        throw RpcErrors.badRequest(
          `Only ${product.stock} units of "${product.name}" are in stock`,
        );
      }

      if (existing) {
        existing.quantity = nextQuantity;
        existing.price = product.price;
        existing.name = product.name;
      } else {
        cart.items.push({
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity: dto.quantity,
          subtotal: 0,
        });
      }
    });
  }

  async updateItem(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<Cart> {
    this.logger.log(
      `User ${userId} setting product ${productId} quantity to ${quantity}`,
    );

    if (quantity === 0) {
      return this.mutateCart(userId, false, (cart) => {
        if (!cart.items.some((item) => item.productId === productId)) {
          throw RpcErrors.notFound(`Item ${productId} is not in the cart`);
        }
        cart.items = cart.items.filter((item) => item.productId !== productId);
      });
    }
    const product = await this.fetchProduct(productId);
    return this.mutateCart(userId, false, (cart) => {
      const item = cart.items.find((item) => item.productId === productId);
      if (!item) {
        throw RpcErrors.notFound(`Item ${productId} is not in the cart`);
      }
      if (product.stock < quantity) {
        throw RpcErrors.badRequest(
          `Only ${product.stock} units of "${product.name}" are in stock`,
        );
      }
      item.quantity = quantity;
      item.price = product.price;
    });
  }

  async removeItem(userId: string, productId: string): Promise<Cart> {
    this.logger.log(`User ${userId} removing product ${productId} from cart`);

    return this.mutateCart(userId, false, (cart) => {
      cart.items = cart.items.filter((item) => item.productId !== productId);
    });
  }

  async clear(userId: string): Promise<Cart> {
    this.logger.log(`Clearing cart for user ${userId}`);
    return this.mutateCart(userId, true, (cart) => {
      cart.items = [];
    });
  }

  private async fetchProduct(productId: string): Promise<Product> {
    const product = await firstValueFrom(
      this.productsClient.send<Product | null>(
        PRODUCT_PATTERNS.FIND_ONE,
        productId,
      ),
    ).catch(() => null);
    if (!product) {
      throw RpcErrors.notFound(`Product ${productId} not found`);
    }

    return product;
  }

  private async mutateCart(
    userId: string,
    create: boolean,
    mutate: (cart: Cart) => void,
  ): Promise<Cart> {
    const saved = await this.carts.manager.transaction(async (manager) => {
      const carts = manager.getRepository(CartSchema);
      if (create) {
        // Concurrent first writes must lock the same row too.
        await carts
          .createQueryBuilder()
          .insert()
          .values({ userId, items: [], total: 0 })
          .orIgnore()
          .execute();
      }
      const cart = await carts.findOne({
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!cart) throw RpcErrors.notFound('Cart is empty');
      mutate(cart);
      this.recalculateCartPrices(cart);
      return carts.save(cart);
    });
    // Publish only after COMMIT succeeds.
    this.events.updated(saved.userId);
    return saved;
  }

  private recalculateCartPrices(cart: Cart) {
    let total = 0;
    for (const item of cart.items) {
      const subtotal = item.price * item.quantity;
      item.subtotal = roundPrice(subtotal);
      total += item.subtotal;
    }
    cart.total = roundPrice(total);
  }

  private createEmptyCart(userId: string): Cart {
    return {
      userId,
      items: [],
      total: 0,
      updatedAt: new Date().toISOString(),
    };
  }
}
