import { EventBus } from '@nestjs/cqrs';
import { OrderPaidEvent, OrderCancelledEvent } from './cqrs/events.js';
import { OrderOperationEntity } from './entities/order-operation.entity.js';
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
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom, timeout } from 'rxjs';
import { Cron } from '@nestjs/schedule';
import { LessThanOrEqual, Repository } from 'typeorm';

import { StockIntentEntity } from './entities/stock-intent.entity.js';
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
    @Optional() private readonly eventBus?: EventBus,
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

    const id = randomUUID();
    const total = items.reduce((sum, { subtotal }) => sum + subtotal, 0);
    let order: OrderEntity;
    // Persist recovery work BEFORE contacting Products. The row lock fences
    // recovery against an in-flight creator, including across Orders replicas.
    await this.orders.manager.getRepository(StockIntentEntity).insert({ id });
    try {
      order = await this.orders.manager.transaction(async (manager) => {
        const intents = manager.getRepository(StockIntentEntity);
        await intents.findOneOrFail({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        await firstValueFrom(
          this.productsClient
            .send(PRODUCT_PATTERNS.RESERVE_STOCK, {
              reservationId: id,
              items: items.map(({ productId, quantity }) => ({
                productId,
                quantity,
              })),
            })
            .pipe(timeout(5000)),
        );
        const saved = await manager.getRepository(OrderEntity).save(
          manager.getRepository(OrderEntity).create({
            id,
            userId,
            items,
            total: roundPrice(total),
            status: OrderStatus.PENDING,
            shippingAddress,
          }),
        );
        await intents.delete(id);
        return saved;
      });
    } catch (error) {
      // If COMMIT succeeded but its acknowledgement was lost, the intent was
      // deleted atomically with the order: recovery will not release its stock.
      try {
        await this.recoverStockIntent(id);
      } catch (recoveryError) {
        this.logger.error(
          `Stock recovery deferred for ${id}: ${String(recoveryError)}`,
        );
      }
      throw error;
    }

    await this.invalidate(order);

    this.logger.log(
      `Created order ${order.id} for user ${userId}: ${items.length} item(s), total ${order.total}`,
    );
    return order;
  }

  @Cron('*/30 * * * * *', { waitForCompletion: true })
  async recoverStock(): Promise<void> {
    try {
      const intents = await this.orders.manager
        .getRepository(StockIntentEntity)
        .find({ order: { createdAt: 'ASC', id: 'ASC' }, take: 100 });
      for (const intent of intents) {
        try {
          await this.recoverStockIntent(intent.id);
        } catch (error) {
          this.logger.error(
            `Stock recovery deferred for ${intent.id}: ${String(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Stock recovery scan failed: ${String(error)}`);
    }
  }

  private async recoverStockIntent(id: string): Promise<void> {
    await this.orders.manager.transaction(async (manager) => {
      const intents = manager.getRepository(StockIntentEntity);
      const intent = await intents.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
      });
      if (!intent) return;
      // Defensive check for records from manual recovery or older deployments.
      if (!(await manager.getRepository(OrderEntity).existsBy({ id }))) {
        await this.releaseStock(id);
      }
      await intents.delete(id);
    });
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

    await this.startOperation(id, 'capture', userId);
    await this.processOperation(id);
    return this.orders.findOneByOrFail({ id });
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

    await this.startOperation(id, 'cancel', userId);
    // Refund and stock release are separate durable steps.
    await this.processOperation(id);
    await this.processOperation(id);
    return this.orders.findOneByOrFail({ id });
  }

  private async startOperation(
    id: string,
    action: 'capture' | 'cancel',
    userId?: string,
  ): Promise<void> {
    const order = await this.orders.manager.transaction(async (manager) => {
      const orders = manager.getRepository(OrderEntity);
      const order = await orders.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order || (userId !== undefined && order.userId !== userId)) {
        throw RpcErrors.notFound(`Order ${id} not found`);
      }
      const operations = manager.getRepository(OrderOperationEntity);
      const existing = await operations.findOneBy({ id });
      if (existing) {
        const same =
          action === 'capture'
            ? existing.kind === 'capture'
            : existing.kind === 'refund' || existing.kind === 'release';
        if (!same)
          throw RpcErrors.conflict('Another order operation is pending');
        return order;
      }
      if (action === 'capture') {
        if (order.status === OrderStatus.PAID) return order;
        if (order.status !== OrderStatus.PENDING || !order.paymentId) {
          throw RpcErrors.badRequest('Order is not pending or has no payment');
        }
        await operations.insert({ id, kind: 'capture' });
      } else {
        if (
          order.status === OrderStatus.SHIPPED ||
          order.status === OrderStatus.DELIVERED
        ) {
          throw RpcErrors.badRequest('Cannot cancel an order that has shipped');
        }
        if (order.status === OrderStatus.PAID) {
          if (!order.captureId)
            throw RpcErrors.badRequest('Order has no capture to refund');
          await operations.insert({ id, kind: 'refund' });
        } else {
          // Status and the release job commit together.
          await orders.update(id, { status: OrderStatus.CANCELLED });
          order.status = OrderStatus.CANCELLED;
          await operations.insert({ id, kind: 'release' });
        }
      }
      return order;
    });
    await this.invalidate(order);
  }

  @Cron('*/30 * * * * *', { waitForCompletion: true })
  async recoverOperations(): Promise<void> {
    try {
      const operations = await this.orders.manager
        .getRepository(OrderOperationEntity)
        .find({
          where: { nextAttemptAt: LessThanOrEqual(new Date()) },
          order: { nextAttemptAt: 'ASC', id: 'ASC' },
          take: 100,
        });
      for (const operation of operations) {
        try {
          await this.processOperation(operation.id);
          const order = await this.orders.findOneByOrFail({ id: operation.id });
          if (
            operation.kind === 'capture' &&
            order.status === OrderStatus.PAID
          ) {
            this.eventBus?.publish(new OrderPaidEvent(order));
          } else if (order.status === OrderStatus.CANCELLED) {
            this.eventBus?.publish(new OrderCancelledEvent(order));
          }
        } catch (error) {
          await this.orders.manager
            .getRepository(OrderOperationEntity)
            .update(operation.id, {
              nextAttemptAt: new Date(Date.now() + 30_000),
            });
          this.logger.error(
            `Order operation deferred for ${operation.id}: ${String(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Order operation scan failed: ${String(error)}`);
    }
  }

  private async processOperation(id: string): Promise<void> {
    const updated = await this.orders.manager.transaction(async (manager) => {
      // All writers lock orders first. Holding this lock fences workers across
      // replicas; the previously committed job survives any external-call failure.
      const orders = manager.getRepository(OrderEntity);
      const order = await orders.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw RpcErrors.notFound(`Order ${id} not found`);
      const operations = manager.getRepository(OrderOperationEntity);
      const operation = await operations.findOneBy({ id });
      if (!operation) return order;
      if (operation.kind === 'capture') {
        const payment = await this.paypal.captureOrder(order.paymentId!);
        if (payment.status !== PAYPAL_COMPLETED_STATUS) {
          throw RpcErrors.badRequest(
            `PayPal payment is not completed: ${payment.status}`,
          );
        }
        await orders.update(id, {
          status: OrderStatus.PAID,
          captureId: payment.captureId,
        });
        order.status = OrderStatus.PAID;
        order.captureId = payment.captureId;
        await operations.delete(id);
      } else if (operation.kind === 'refund') {
        await this.refundPayment(order);
        await orders.update(id, { status: OrderStatus.CANCELLED });
        order.status = OrderStatus.CANCELLED;
        await operations.update(id, { kind: 'release' });
      } else {
        await this.releaseStock(id, order.items);
        await operations.delete(id);
      }
      return order;
    });
    await this.invalidate(updated);
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
    const updated = await this.orders.manager.transaction(async (manager) => {
      const orders = manager.getRepository(OrderEntity);
      const order = await orders.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw RpcErrors.notFound(`Order ${id} not found`);
      if (order.status !== from) return null;
      if (await manager.getRepository(OrderOperationEntity).existsBy({ id })) {
        throw RpcErrors.conflict('Another order operation is pending');
      }
      await orders.update(id, patch);
      return orders.findOneByOrFail({ id });
    });
    if (!updated) return null;

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

  private async releaseStock(
    id: string,
    legacyItems?: OrderItem[],
  ): Promise<void> {
    await firstValueFrom(
      this.productsClient
        .send(PRODUCT_PATTERNS.RELEASE_STOCK, {
          reservationId: id,
          ...(legacyItems
            ? {
                legacyItems: legacyItems.map(({ productId, quantity }) => ({
                  productId,
                  quantity,
                })),
              }
            : {}),
        })
        .pipe(timeout(5000)),
    );
  }
}
