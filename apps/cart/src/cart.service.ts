import {
  AddCartItemDto,
  type Cart,
  type Product,
  PRODUCT_PATTERNS,
  RpcErrors,
  SERVICE_NAMES,
} from '@app/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { CartSchema } from './schemas/cart.schema';

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    @InjectRepository(CartSchema)
    private readonly carts: Repository<Cart>,
    @Inject(SERVICE_NAMES.PRODUCTS)
    private readonly productsClient: ClientProxy,
  ) {}

  async get(userId: string): Promise<Cart> {
    const cart = await this.carts.findOneBy({ userId });
    this.logger.debug(
      `Cart for user ${userId} has ${cart?.items.length ?? 0} item(s)`,
    );
    return cart ?? this.emptyCart(userId);
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    this.logger.log(
      `User ${userId} adding ${dto.quantity}x product ${dto.productId} to cart`,
    );
    const product = await this.fetchProduct(dto.productId);

    const cart =
      (await this.carts.findOneBy({ userId })) ?? this.newCart(userId);
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

    return this.persist(cart);
  }

  async updateItem(userId: string, productId: string, quantity: number) {
    this.logger.log(
      `User ${userId} setting product ${productId} quantity to ${quantity}`,
    );
    const cart = await this.carts.findOneBy({ userId });
    const item = cart?.items.find((item) => item.productId === productId);
    if (!cart || !item) {
      this.logger.warn(
        `User ${userId} cannot update item ${productId}: not in cart`,
      );
      throw RpcErrors.notFound(`Item ${productId} is not in the cart`);
    }

    if (quantity === 0) {
      return this.removeItem(userId, productId);
    }

    const product = await this.fetchProduct(productId);
    if (product.stock < quantity) {
      this.logger.warn(
        `Rejected update for user ${userId}: only ${product.stock} of "${product.name}" in stock (requested ${quantity})`,
      );
      throw RpcErrors.badRequest(
        `Only ${product.stock} units of "${product.name}" are in stock`,
      );
    }

    item.quantity = quantity;
    item.price = product.price;
    return this.persist(cart);
  }

  async removeItem(userId: string, productId: string) {
    this.logger.log(`User ${userId} removing product ${productId} from cart`);
    const cart = await this.carts.findOneBy({ userId });
    if (!cart) {
      this.logger.warn(`User ${userId} cannot remove item: cart is empty`);
      throw RpcErrors.notFound('Cart is empty');
    }
    cart.items = cart.items.filter((item) => item.productId !== productId);
    return this.persist(cart);
  }

  clear(userId: string) {
    this.logger.log(`Clearing cart for user ${userId}`);
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

  private async persist(cart: Cart) {
    this.recalculate(cart);
    const saved = await this.carts.save(cart);
    this.logger.debug(
      `Persisted cart for user ${cart.userId}: ${cart.items.length} item(s), total ${cart.total}`,
    );
    return saved;
  }

  private recalculate(cart: Cart) {
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
