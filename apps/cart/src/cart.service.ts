import {
  type AddCartItemDto,
  type Cart,
  type CartItem,
  type Product,
  PRODUCT_PATTERNS,
  SERVICE_NAMES,
} from '@app/contracts';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class CartService {
  private readonly carts = new Map<string, Cart>();

  constructor(
    @Inject(SERVICE_NAMES.PRODUCTS)
    private readonly productsClient: ClientProxy,
  ) {}

  get(userId: string) {
    return this.carts.get(userId) ?? this.emptyCart(userId);
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const product = await this.fetchProduct(dto.productId);

    const cart = this.carts.get(userId) ?? this.emptyCart(userId);
    const existing = cart.items.find(
      ({ productId }) => productId === product.id,
    );
    const nextQuantity = (existing?.quantity ?? 0) + dto.quantity;

    if (product.stock < nextQuantity) {
      throw new BadRequestException(
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
    const cart = this.carts.get(userId);
    const item = cart?.items.find((item) => item.productId === productId);
    if (!cart || !item) {
      throw new NotFoundException(`Item ${productId} is not in the cart`);
    }

    if (quantity === 0) {
      return this.removeItem(userId, productId);
    }

    const product = await this.fetchProduct(productId);
    if (product.stock < quantity) {
      throw new BadRequestException(
        `Only ${product.stock} units of "${product.name}" are in stock`,
      );
    }

    item.quantity = quantity;
    item.price = product.price;
    return this.persist(cart);
  }

  removeItem(userId: string, productId: string) {
    const cart = this.carts.get(userId);
    if (!cart) {
      throw new NotFoundException('Cart is empty');
    }
    cart.items = cart.items.filter((item) => item.productId !== productId);
    return this.persist(cart);
  }

  clear(userId: string) {
    const cart = this.emptyCart(userId);
    this.carts.set(userId, cart);
    return cart;
  }

  private async fetchProduct(productId: string) {
    const product = await firstValueFrom(
      this.productsClient.send<Product | null>(
        PRODUCT_PATTERNS.FIND_ONE,
        productId,
      ),
    ).catch(() => null);
    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }
    return product;
  }

  private persist(cart: Cart) {
    this.recalculate(cart);
    this.carts.set(cart.userId, cart);
    return cart;
  }

  private recalculate(cart: Cart) {
    let total = 0;
    for (const item of cart.items) {
      const subtotal = item.price * item.quantity;
      item.subtotal = Math.round(subtotal * 100) / 100;
      total += item.subtotal;
    }
    cart.total = Math.round(total * 100) / 100;
    cart.updatedAt = new Date().toISOString();
  }

  private emptyCart(userId: string) {
    return {
      userId,
      items: [] as CartItem[],
      total: 0,
      updatedAt: new Date().toISOString(),
    };
  }
}
