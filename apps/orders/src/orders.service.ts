import { randomUUID } from 'node:crypto';

import { CacheService } from '@app/cache';
import { SERVICE_NAMES } from '@app/config';
import {
  type Cart,
  CART_PATTERNS,
  CartItem,
  type OrderItem,
  type OrderPayment,
  OrderStatus,
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

import { OrderEntity } from './entities/order.entity.js';
import {
  PAYPAL_ALREADY_REFUNDED_STATUS,
  PaypalService,
} from './paypal/paypal.service.js';

const PAYPAL_COMPLETED_STATUS = 'COMPLETED';

// PENDING in PayPal means an asynchronous refund (e.g. eCheck) that completes later.
const REFUND_ACCEPTED_STATUSES: readonly string[] = [
  PAYPAL_COMPLETED_STATUS,
  'PENDING',
  PAYPAL_ALREADY_REFUNDED_STATUS,
];

const MANUAL_STATUS_TRANSITIONS: Partial<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  [OrderStatus.PAID]: [OrderStatus.SHIPPED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
};

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
    private readonly paypal: PaypalService,
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

  async findOne(id: string, userId?: string): Promise<OrderEntity> {
    const order = await this.cache.wrap(orderCacheKey(id), async () => {
      const found = await this.orders.findOneBy({ id });
      if (!found) {
        this.logger.warn(`Order ${id} not found`);
        throw RpcErrors.notFound(`Order ${id} not found`);
      }
      return found;
    });

    // Treat someone else's order as missing so order ids cannot be enumerated.
    if (userId !== undefined && order.userId !== userId) {
      this.logger.warn(
        `User ${userId} tried to access order ${id} owned by ${order.userId}`,
      );
      throw RpcErrors.notFound(`Order ${id} not found`);
    }

    return order;
  }

  async updateStatus(id: string, status: OrderStatus): Promise<OrderEntity> {
    const order = await this.findOne(id);
    if (order.status === status) {
      this.logger.debug(`Order ${id} is already ${status}`);
      return order;
    }

    if (status === OrderStatus.PAID) {
      this.logger.warn(`Order ${id} cannot be marked ${status} manually`);
      throw RpcErrors.badRequest(
        `An order becomes ${OrderStatus.PAID} only by capturing its payment`,
      );
    }

    if (status === OrderStatus.CANCELLED) {
      this.logger.warn(`Order ${id} cannot be cancelled via a status update`);
      throw RpcErrors.badRequest('Use the cancel operation to cancel an order');
    }

    const allowedStatuses = MANUAL_STATUS_TRANSITIONS[order.status] ?? [];
    if (!allowedStatuses.includes(status)) {
      this.logger.warn(
        `Order ${id} cannot change status ${order.status} to ${status}`,
      );
      throw RpcErrors.badRequest(
        `Order status cannot change from ${order.status} to ${status}`,
      );
    }

    const updated = await this.transition(id, order.status, { status });
    if (!updated) {
      this.logger.warn(`Order ${id} was modified concurrently`);
      throw RpcErrors.conflict(
        `Order ${id} was modified concurrently, try again`,
      );
    }

    this.logger.log(`Order ${id} status ${order.status} changed to ${status}`);
    return updated;
  }

  async pay(id: string, userId?: string): Promise<OrderPayment> {
    this.logger.log(`Starting PayPal payment for order ${id}`);

    const order = await this.findOne(id, userId);
    if (order.status !== OrderStatus.PENDING) {
      this.logger.warn(
        `Order ${id} is ${order.status} and cannot start a payment`,
      );
      throw RpcErrors.badRequest(
        `Only a ${OrderStatus.PENDING} order can be paid, order ${id} is ${order.status}`,
      );
    }

    const payment = await this.paypal.createOrder(order.id, order.total);

    const updated = await this.transition(id, OrderStatus.PENDING, {
      paymentId: payment.id,
    });
    if (!updated) {
      this.logger.warn(
        `Order ${id} changed while its payment was being created`,
      );
      throw RpcErrors.conflict(
        `Order ${id} is no longer ${OrderStatus.PENDING}, the payment was not started`,
      );
    }

    this.logger.log(
      `Order ${id} is awaiting approval of PayPal payment ${payment.id}`,
    );
    return {
      orderId: updated.id,
      paymentId: payment.id,
      paymentStatus: payment.status,
      approveUrl: payment.approveUrl,
    };
  }

  async capturePayment(id: string, userId?: string): Promise<OrderEntity> {
    this.logger.log(`Capturing PayPal payment for order ${id}`);

    const order = await this.findOne(id, userId);
    if (order.status === OrderStatus.PAID) {
      this.logger.debug(`Order ${id} is already paid`);
      return order;
    }

    if (order.status !== OrderStatus.PENDING) {
      this.logger.warn(
        `Order ${id} is ${order.status} and cannot capture a payment`,
      );
      throw RpcErrors.badRequest(
        `Only a ${OrderStatus.PENDING} order can capture a payment, order ${id} is ${order.status}`,
      );
    }

    if (!order.paymentId) {
      this.logger.warn(`Order ${id} has no PayPal payment to capture`);
      throw RpcErrors.badRequest(
        `Order ${id} has no payment to capture, start a payment first`,
      );
    }

    const payment = await this.paypal.captureOrder(order.paymentId);
    if (payment.status !== PAYPAL_COMPLETED_STATUS) {
      this.logger.warn(
        `PayPal payment ${order.paymentId} for order ${id} is not completed: ${payment.status}`,
      );
      throw RpcErrors.badRequest(
        `PayPal payment is not completed, its status is ${payment.status}`,
      );
    }

    const updated = await this.transition(id, OrderStatus.PENDING, {
      status: OrderStatus.PAID,
      captureId: payment.captureId ?? null,
    });
    if (!updated) {
      this.logger.warn(
        `Order ${id} changed while its payment was captured, refunding`,
      );
      if (payment.captureId) {
        await this.paypal.refundCapture(payment.captureId);
      }
      throw RpcErrors.conflict(
        `Order ${id} changed while capturing the payment, the charge was refunded`,
      );
    }

    this.logger.log(
      `Order ${id} paid with PayPal payment ${order.paymentId} (total ${order.total})`,
    );
    return updated;
  }

  async captureByPaymentId(paymentId: string): Promise<OrderEntity> {
    const order = await this.orders.findOneBy({ paymentId });
    if (!order) {
      this.logger.warn(`No order found for PayPal payment ${paymentId}`);
      throw RpcErrors.notFound(`No order found for payment ${paymentId}`);
    }

    return this.capturePayment(order.id);
  }

  async cancel(id: string, userId?: string): Promise<OrderEntity> {
    this.logger.log(`Cancelling order ${id}`);

    const order = await this.findOne(id, userId);
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

    if (order.status === OrderStatus.PAID) {
      await this.refundPayment(order);
    }

    const updated = await this.transition(id, order.status, {
      status: OrderStatus.CANCELLED,
    });
    if (!updated) {
      this.logger.warn(`Order ${id} changed while it was being cancelled`);
      throw RpcErrors.conflict(
        `Order ${id} changed while it was being cancelled, try again`,
      );
    }

    await Promise.all(order.items.map(this.rollbackOrderItemStock.bind(this)));

    this.logger.log(`Order ${id} cancelled and stock restored`);
    return updated;
  }

  private async refundPayment(order: OrderEntity): Promise<void> {
    if (!order.captureId) {
      this.logger.warn(
        `Order ${order.id} is paid but has no PayPal capture to refund`,
      );
      throw RpcErrors.badRequest(
        `Order ${order.id} payment cannot be refunded automatically`,
      );
    }

    const refund = await this.paypal.refundCapture(order.captureId);
    if (!REFUND_ACCEPTED_STATUSES.includes(refund.status)) {
      this.logger.warn(
        `PayPal refund ${refund.id} for order ${order.id} failed: ${refund.status}`,
      );
      throw RpcErrors.badRequest(
        `PayPal refund failed with status ${refund.status}`,
      );
    }

    this.logger.log(
      `Refunded PayPal capture ${order.captureId} for order ${order.id} (total ${order.total})`,
    );
  }

  private async transition(
    id: string,
    from: OrderStatus,
    patch: Partial<OrderEntity>,
  ): Promise<OrderEntity | null> {
    // Updates order by criteria (id, status) with partial patch object
    // If affected is 0, it means that that order was changed concurrently
    const result = await this.orders.update({ id, status: from }, patch);
    if (!result.affected) {
      return null;
    }

    const updated = await this.orders.findOneBy({ id });
    if (!updated) {
      throw RpcErrors.notFound(`Order ${id} not found`);
    }

    await this.invalidate(updated);
    return updated;
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
