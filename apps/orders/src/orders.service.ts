import {
  type Cart,
  CART_PATTERNS,
  type OrderItem,
  OrderStatus,
  type Product,
  PRODUCT_PATTERNS,
} from '@app/domains';
import { SERVICE_NAMES } from '@app/config';
import { RpcErrors } from '@app/filters';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { OrderEntity } from './entities/order.entity';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    @Inject(SERVICE_NAMES.PRODUCTS)
    private readonly productsClient: ClientProxy,
    @Inject(SERVICE_NAMES.CART) private readonly cartClient: ClientProxy,
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

    const items: OrderItem[] = cart.items.map((cartItem) => {
      const product = productsMap.get(cartItem.productId);
      if (!product) {
        throw RpcErrors.badRequest(
          `Product ${cartItem.productId} is no longer available`,
        );
      }

      if (product.stock < cartItem.quantity) {
        throw RpcErrors.badRequest(
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

    this.logger.debug(
      `Reserving stock for ${items.length} product(s) on user ${userId}'s order`,
    );
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

    const total = items.reduce((sum, { subtotal }) => sum + subtotal, 0);
    const order = await this.orders.save(
      this.orders.create({
        id: randomUUID(),
        userId,
        items,
        total: Math.round(total * 100) / 100,
        status: OrderStatus.PENDING,
        shippingAddress,
      }),
    );

    await firstValueFrom(this.cartClient.send(CART_PATTERNS.CLEAR, userId));

    this.logger.log(
      `Created order ${order.id} for user ${userId}: ${items.length} item(s), total ${order.total}`,
    );
    return order;
  }

  async findAll(userId?: string): Promise<OrderEntity[]> {
    const orders = await this.orders.find({
      where: userId ? { userId } : {},
    });
    this.logger.debug(
      `Listing ${orders.length} order(s)${userId ? ` for user ${userId}` : ''}`,
    );
    return orders;
  }

  async findOne(id: string): Promise<OrderEntity> {
    const order = await this.orders.findOneBy({ id });
    if (!order) {
      this.logger.warn(`Order ${id} not found`);
      throw RpcErrors.notFound(`Order ${id} not found`);
    }
    return order;
  }

  async updateStatus(id: string, status: OrderStatus): Promise<OrderEntity> {
    const order = await this.findOne(id);
    if (order.status === OrderStatus.CANCELLED) {
      this.logger.warn(`Order ${id} is cancelled and cannot change status`);
      throw RpcErrors.badRequest('A cancelled order cannot change status');
    }
    const previous = order.status;
    order.status = status;
    const saved = await this.orders.save(order);
    this.logger.log(`Order ${id} status ${previous} -> ${status}`);
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
    const saved = await this.orders.save(order);
    this.logger.log(`Order ${id} cancelled and stock restored`);
    return saved;
  }
}
