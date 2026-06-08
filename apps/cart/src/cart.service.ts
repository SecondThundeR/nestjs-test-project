import {
  AddCartItemDto,
  type Cart,
  type Product,
  PRODUCT_PATTERNS,
  RpcErrors,
  SERVICE_NAMES,
} from '@app/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { CartEntity } from './entities/cart.entity';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(CartEntity)
    private readonly carts: Repository<CartEntity>,
    @Inject(SERVICE_NAMES.PRODUCTS)
    private readonly productsClient: ClientProxy,
  ) {}

  async get(userId: string): Promise<Cart> {
    const cart = await this.carts.findOneBy({ userId });
    return cart ?? this.emptyCart(userId);
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const product = await this.fetchProduct(dto.productId);

    const cart =
      (await this.carts.findOneBy({ userId })) ?? this.newCart(userId);
    const existing = cart.items.find(
      ({ productId }) => productId === product.id,
    );
    const nextQuantity = (existing?.quantity ?? 0) + dto.quantity;

    if (product.stock < nextQuantity) {
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

    return this.persist(cart);
  }

  async updateItem(userId: string, productId: string, quantity: number) {
    const cart = await this.carts.findOneBy({ userId });
    const item = cart?.items.find((item) => item.productId === productId);
    if (!cart || !item) {
      throw RpcErrors.notFound(`Item ${productId} is not in the cart`);
    }

    if (quantity === 0) {
      return this.removeItem(userId, productId);
    }

    const product = await this.fetchProduct(productId);
    if (product.stock < quantity) {
      throw RpcErrors.badRequest(
        `Only ${product.stock} units of "${product.name}" are in stock`,
      );
    }

    item.quantity = quantity;
    item.price = product.price;
    return this.persist(cart);
  }

  async removeItem(userId: string, productId: string) {
    const cart = await this.carts.findOneBy({ userId });
    if (!cart) {
      throw RpcErrors.notFound('Cart is empty');
    }
    cart.items = cart.items.filter((item) => item.productId !== productId);
    return this.persist(cart);
  }

  clear(userId: string) {
    return this.carts.save(this.newCart(userId));
  }

  private async fetchProduct(productId: string) {
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

  private persist(cart: CartEntity) {
    this.recalculate(cart);
    return this.carts.save(cart);
  }

  private recalculate(cart: CartEntity) {
    let total = 0;
    for (const item of cart.items) {
      const subtotal = item.price * item.quantity;
      item.subtotal = Math.round(subtotal * 100) / 100;
      total += item.subtotal;
    }
    cart.total = Math.round(total * 100) / 100;
  }

  private newCart(userId: string) {
    return this.carts.create({ userId, items: [], total: 0 });
  }

  private emptyCart(userId: string): Cart {
    return {
      userId,
      items: [],
      total: 0,
      updatedAt: new Date().toISOString(),
    };
  }
}
