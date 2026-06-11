import {
  type Cart,
  CART_PATTERNS,
  CartItem,
  type OrderItem,
  OrderStatus,
  type Product,
  PRODUCT_PATTERNS,
} from '@app/domains';
import { CacheService } from '@app/cache';
import { SERVICE_NAMES } from '@app/config';
import { RpcErrors } from '@app/filters';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { OrderEntity } from './entities/order.entity';
import { roundPrice } from '@app/utils';

const ALL_ORDERS_CACHE_KEY = 'orders:all';

function orderCacheKey(id: string): string {
  return `order:${id}`;
}

function userOrdersCacheKey(userId: string): string {
  return `orders:user:${userId}`;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    @Inject(SERVICE_NAMES.PRODUCTS)
    private readonly productsClient: ClientProxy,
    @Inject(SERVICE_NAMES.CART) private readonly cartClient: ClientProxy,
    private readonly cache: CacheService,
  ) {}

  async create(userId: string, shippingAddress: string): Promise<OrderEntity> {
    this.logger.log(`Creating order for user ${userId}`);

    const cart = await firstValueFrom(
      this.cartClient.send<Cart>(CART_PATTERNS.GET, userId),
    );
    if (!cart.items.length) {
      this.logger.warn(`User ${userId} tried to order with an empty cart`);
      throw RpcErrors.badRequest('Cannot create an order from an empty cart');
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

    const cartItemMapper = this.createCartItemMapper(productsMap);
    const items = cart.items.map(cartItemMapper);

    this.logger.debug(
      `Reserving stock for ${items.length} product(s) on user ${userId}'s order`,
    );

    const orderItemStockDecreaseMapper =
      this.createOrderItemStockDecreaseMapper(productsMap);
    await Promise.all(items.map(orderItemStockDecreaseMapper));

    const total = items.reduce((sum, { subtotal }) => sum + subtotal, 0);
    const order = await this.orders.save(
      this.orders.create({
        id: randomUUID(),
        userId,
        items,
        total: roundPrice(total),
        status: OrderStatus.PENDING,
        shippingAddress,
      }),
    );

    await this.invalidate(order);

    await firstValueFrom(this.cartClient.send(CART_PATTERNS.CLEAR, userId));

    this.logger.log(
      `Created order ${order.id} for user ${userId}: ${items.length} item(s), total ${order.total}`,
    );
    return order;
  }

  async findAll(userId?: string): Promise<OrderEntity[]> {
    const key = userId ? userOrdersCacheKey(userId) : ALL_ORDERS_CACHE_KEY;

    return this.cache.wrap(key, async () => {
      const orders = await this.orders.find({
        where: userId ? { userId } : {},
      });
      this.logger.debug(
        `Listing ${orders.length} order(s)${userId ? ` for user ${userId}` : ''}`,
      );
      return orders;
    });
  }

  async findOne(id: string): Promise<OrderEntity> {
    return this.cache.wrap(orderCacheKey(id), async () => {
      const order = await this.orders.findOneBy({ id });
      if (!order) {
        this.logger.warn(`Order ${id} not found`);
        throw RpcErrors.notFound(`Order ${id} not found`);
      }
      return order;
    });
  }

  async updateStatus(id: string, status: OrderStatus): Promise<OrderEntity> {
    const order = await this.findOne(id);
    if (order.status === OrderStatus.CANCELLED) {
      this.logger.warn(`Order ${id} is cancelled and cannot change status`);
      throw RpcErrors.badRequest('A cancelled order cannot change status');
    }

    const previousOrderStatus = order.status;
    order.status = status;
    const saved = await this.orders.save(order);

    await this.invalidate(saved);

    this.logger.log(
      `Order ${id} status ${previousOrderStatus} changed to ${status}`,
    );
    return saved;
  }

  async cancel(id: string): Promise<OrderEntity> {
    this.logger.log(`Cancelling order ${id}`);

    const order = await this.findOne(id);
    if (order.status === OrderStatus.CANCELLED) {
      this.logger.debug(`Order ${id} is already cancelled`);
      return order;
    }

    if (
      order.status === OrderStatus.SHIPPED ||
      order.status === OrderStatus.DELIVERED
    ) {
      this.logger.warn(`Cannot cancel order ${id}: already ${order.status}`);
      throw RpcErrors.badRequest(
        `Cannot cancel an order that is already ${order.status}`,
      );
    }

    await Promise.all(order.items.map(this.rollbackOrderItemStock.bind(this)));

    order.status = OrderStatus.CANCELLED;
    const saved = await this.orders.save(order);

    await this.invalidate(saved);

    this.logger.log(`Order ${id} cancelled and stock restored`);
    return saved;
  }

  private invalidate(order: OrderEntity): Promise<void> {
    return this.cache.del([
      orderCacheKey(order.id),
      userOrdersCacheKey(order.userId),
      ALL_ORDERS_CACHE_KEY,
    ]);
  }

  private createCartItemMapper(productsMap: Map<string, Product>) {
    return (item: CartItem): OrderItem => {
      const product = productsMap.get(item.productId);
      if (!product) {
        throw RpcErrors.badRequest(
          `Product ${item.productId} is no longer available`,
        );
      }

      if (product.stock < item.quantity) {
        throw RpcErrors.badRequest(
          `Only ${product.stock} units of "${product.name}" are in stock`,
        );
      }

      return {
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        subtotal: roundPrice(product.price * item.quantity),
      };
    };
  }

  private createOrderItemStockDecreaseMapper(
    productsMap: Map<string, Product>,
  ) {
    return (item: OrderItem): Promise<Product> => {
      const product = productsMap.get(item.productId)!;
      const payload = {
        id: item.productId,
        data: { stock: product.stock - item.quantity },
      };

      return firstValueFrom(
        this.productsClient.send(PRODUCT_PATTERNS.UPDATE, payload),
      );
    };
  }

  private async rollbackOrderItemStock(item: OrderItem) {
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
  }
}
