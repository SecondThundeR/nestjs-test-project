import {
  Cart,
  CART_PATTERNS,
  Order,
  OrderStatus,
  Product,
  PRODUCT_PATTERNS,
  SERVICE_NAMES,
} from '@app/contracts';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OrdersService {
  private readonly orders = new Map<string, Order>();

  constructor(
    @Inject(SERVICE_NAMES.PRODUCTS)
    private readonly productsClient: ClientProxy,
    @Inject(SERVICE_NAMES.CART) private readonly cartClient: ClientProxy,
  ) {}

  async create(userId: string, shippingAddress: string) {
    const cart = await firstValueFrom(
      this.cartClient.send<Cart>(CART_PATTERNS.GET, userId),
    );

    if (!cart.items.length) {
      throw new BadRequestException(
        'Cannot create an order from an empty cart',
      );
    }

    const productIds = cart.items.map(({ productId }) => productId);
    const products = await firstValueFrom(
      this.productsClient.send<Product[]>(
        PRODUCT_PATTERNS.FIND_MANY,
        productIds,
      ),
    );

    const productsMap = new Map(
      products.map((product) => [product.id, product]),
    );

    const items = cart.items.map((cartItem) => {
      const product = productsMap.get(cartItem.productId);
      if (!product) {
        throw new BadRequestException(
          `Product ${cartItem.productId} is no longer available`,
        );
      }

      if (product.stock < cartItem.quantity) {
        throw new BadRequestException(
          `Only ${product.stock} units of "${product.name}" are in stock`,
        );
      }

      const subtotal = product.price * cartItem.quantity;

      return {
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: cartItem.quantity,
        subtotal: Math.round(subtotal * 100) / 100,
      };
    });

    await Promise.all(
      items.map((item) => {
        const product = productsMap.get(item.productId)!;
        const payload = {
          id: item.productId,
          data: { stock: product.stock - item.quantity },
        };
        return firstValueFrom(
          this.productsClient.send(PRODUCT_PATTERNS.UPDATE, payload),
        );
      }),
    );

    const now = new Date().toISOString();
    const total = items.reduce((sum, { subtotal }) => sum + subtotal, 0);
    const order = {
      id: randomUUID(),
      userId,
      items,
      total: Math.round(total * 100) / 100,
      status: OrderStatus.PENDING,
      shippingAddress,
      createdAt: now,
      updatedAt: now,
    };
    this.orders.set(order.id, order);

    await firstValueFrom(this.cartClient.send(CART_PATTERNS.CLEAR, userId));

    return order;
  }

  findAll(userId?: string) {
    const all = [...this.orders.values()];
    return userId ? all.filter((order) => order.userId === userId) : all;
  }

  findOne(id: string) {
    const order = this.orders.get(id);
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
  }

  updateStatus(id: string, status: OrderStatus) {
    const order = this.findOne(id);
    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('A cancelled order cannot change status');
    }
    order.status = status;
    order.updatedAt = new Date().toISOString();
    this.orders.set(id, order);
    return order;
  }

  async cancel(id: string) {
    const order = this.findOne(id);
    if (order.status === OrderStatus.CANCELLED) {
      return order;
    }
    if (
      order.status === OrderStatus.SHIPPED ||
      order.status === OrderStatus.DELIVERED
    ) {
      throw new BadRequestException(
        `Cannot cancel an order that is already ${order.status}`,
      );
    }

    await Promise.all(
      order.items.map(async (item) => {
        const product = await firstValueFrom(
          this.productsClient.send<Product | null>(
            PRODUCT_PATTERNS.FIND_ONE,
            item.productId,
          ),
        ).catch(() => null);
        if (!product) {
          return;
        }
        const payload = {
          id: item.productId,
          data: { stock: product.stock + item.quantity },
        };
        return firstValueFrom(
          this.productsClient.send<Product>(PRODUCT_PATTERNS.UPDATE, payload),
        );
      }),
    );

    order.status = OrderStatus.CANCELLED;
    order.updatedAt = new Date().toISOString();
    this.orders.set(id, order);
    return order;
  }
}
