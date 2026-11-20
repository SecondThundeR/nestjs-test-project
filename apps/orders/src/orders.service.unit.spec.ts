import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { OrderOperationEntity } from './entities/order-operation.entity.js';
import { StockIntentEntity } from './entities/stock-intent.entity.js';
import { EventBus } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { CacheService } from '@app/cache';
import { SERVICE_NAMES } from '@app/config';
import {
  type Cart,
  CART_PATTERNS,
  type CartItem,
  OrderStatus,
  type Product,
  PRODUCT_PATTERNS,
} from '@app/domains';
import { RpcException } from '@nestjs/microservices';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { of, throwError } from 'rxjs';
import {
  type DataSource,
  type ObjectLiteral,
  SelectQueryBuilder,
} from 'typeorm';

import { createInMemoryCache } from '../../../test/utils/in-memory-cache.js';
import { createInMemoryDataSource } from '../../../test/utils/in-memory-database.js';
import {
  makePaypalCapture,
  makePaypalOrder,
  makePaypalRefund,
} from '../../../test/utils/paypal.js';
import { OrderCancelledEvent, OrderPaidEvent } from './cqrs/events.js';
import { OrderEntity } from './entities/order.entity.js';
import { OrdersService } from './orders.service.js';
import { PaypalService } from './paypal/paypal.service.js';

const USER = 'user-1';
const ADDRESS = '1 Test Street';

function makeProduct(overrides: Partial<Product> = {}): Product {
  const now = new Date().toISOString();
  return {
    id: 'p-1',
    name: 'Widget',
    description: '',
    price: 10,
    stock: 100,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: 'p-1',
    name: 'Widget',
    price: 10,
    quantity: 2,
    subtotal: 20,
    ...overrides,
  };
}

function makeCart(items: CartItem[]): Cart {
  return {
    userId: USER,
    items,
    total: items.reduce((sum, item) => sum + item.subtotal, 0),
    updatedAt: new Date().toISOString(),
  };
}

describe('OrdersService', () => {
  let service: OrdersService;
  let productsClient: { send: Mock };
  let cartClient: { send: Mock };
  let paypal: {
    createOrder: Mock;
    captureOrder: Mock;
    refundCapture: Mock;
  };
  let dataSource: DataSource;
  let moduleRef: TestingModule;
  let cacheStore: Map<string, unknown>;

  beforeEach(async () => {
    productsClient = { send: vi.fn() };
    cartClient = { send: vi.fn() };
    paypal = {
      createOrder: vi.fn(),
      captureOrder: vi.fn(),
      refundCapture: vi.fn(),
    };
    dataSource = await createInMemoryDataSource([
      OrderEntity,
      StockIntentEntity,
      OrderOperationEntity,
    ]);
    const { service: cacheService, store } = createInMemoryCache();
    cacheStore = store;

    moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: getRepositoryToken(OrderEntity),
          useValue: dataSource.getRepository(OrderEntity),
        },
        { provide: SERVICE_NAMES.PRODUCTS, useValue: productsClient },
        { provide: SERVICE_NAMES.CART, useValue: cartClient },
        { provide: CacheService, useValue: cacheService },
        { provide: PaypalService, useValue: paypal },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await moduleRef.close();
    await dataSource.destroy();
  });

  async function createOrder() {
    cartClient.send.mockImplementation((pattern: string) => {
      if (pattern === CART_PATTERNS.GET) {
        return of(makeCart([makeCartItem()]));
      }
      return of(undefined);
    });
    productsClient.send.mockImplementation((pattern: string) => {
      if (pattern === PRODUCT_PATTERNS.FIND_MANY) {
        return of([makeProduct({ stock: 5 })]);
      }
      return of(makeProduct());
    });

    return service.create(USER, ADDRESS);
  }

  async function payAndCapture(orderId: string) {
    paypal.createOrder.mockResolvedValue(makePaypalOrder());
    paypal.captureOrder.mockResolvedValue(makePaypalCapture());
    await service.pay(orderId);
    await service.capturePayment(orderId);
  }

  describe('create', () => {
    it('builds a PENDING order from the cart and products', async () => {
      const order = await createOrder();

      expect(order).toMatchObject({
        userId: USER,
        shippingAddress: ADDRESS,
        status: OrderStatus.PENDING,
        total: 20,
      });
      expect(order.items).toEqual([
        {
          productId: 'p-1',
          name: 'Widget',
          price: 10,
          quantity: 2,
          subtotal: 20,
        },
      ]);
      expect(typeof order.id).toBe('string');
    });

    it('reads the cart via the cart client GET pattern', async () => {
      await createOrder();

      expect(cartClient.send).toHaveBeenCalledWith(CART_PATTERNS.GET, USER);
    });

    it('reserves all ordered items in one operation', async () => {
      await createOrder();

      expect(productsClient.send).toHaveBeenCalledWith(
        PRODUCT_PATTERNS.RESERVE_STOCK,
        {
          reservationId: expect.any(String),
          items: [{ productId: 'p-1', quantity: 2 }],
        },
      );
    });

    it('does not clear the cart synchronously (the cart reacts to the Kafka order.created event)', async () => {
      await createOrder();

      expect(cartClient.send).not.toHaveBeenCalledWith(
        CART_PATTERNS.CLEAR,
        USER,
      );
    });

    it('persists the order so it can be retrieved afterwards', async () => {
      const order = await createOrder();

      await expect(service.findOne(order.id)).resolves.toStrictEqual(order);
      await expect(service.findAll(USER)).resolves.toContainEqual(order);
    });

    it('throws RpcException when the cart is empty', async () => {
      cartClient.send.mockReturnValue(of(makeCart([])));

      await expect(service.create(USER, ADDRESS)).rejects.toBeInstanceOf(
        RpcException,
      );
    });

    it('throws RpcException when a product no longer exists', async () => {
      cartClient.send.mockReturnValue(of(makeCart([makeCartItem()])));
      productsClient.send.mockReturnValue(of([]));

      await expect(service.create(USER, ADDRESS)).rejects.toBeInstanceOf(
        RpcException,
      );
    });

    it('throws RpcException when stock is insufficient', async () => {
      cartClient.send.mockReturnValue(
        of(makeCart([makeCartItem({ quantity: 10 })])),
      );
      productsClient.send.mockReturnValue(of([makeProduct({ stock: 3 })]));

      await expect(service.create(USER, ADDRESS)).rejects.toBeInstanceOf(
        RpcException,
      );
    });
  });

  describe('findAll', () => {
    it('returns an empty list when there are no orders', async () => {
      await expect(service.findAll()).resolves.toEqual([]);
    });

    it('filters by userId when one is provided', async () => {
      const order = await createOrder();

      await expect(service.findAll(USER)).resolves.toEqual([order]);
      await expect(service.findAll('someone-else')).resolves.toEqual([]);
    });
  });

  describe('findOne', () => {
    it('throws RpcException for an unknown id', async () => {
      await expect(service.findOne('missing')).rejects.toThrow(RpcException);
    });

    it('returns the order for its owner', async () => {
      const order = await createOrder();

      await expect(service.findOne(order.id, USER)).resolves.toMatchObject({
        id: order.id,
      });
    });

    it('hides the order from another user as not found', async () => {
      const order = await createOrder();

      const error: unknown = await service
        .findOne(order.id, 'someone-else')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RpcException);
      expect((error as RpcException).getError()).toMatchObject({
        statusCode: 404,
      });
    });

    it('blocks owner-scoped cancel for a different user', async () => {
      const order = await createOrder();

      await expect(
        service.cancel(order.id, 'someone-else'),
      ).rejects.toBeInstanceOf(RpcException);
      await expect(service.findOne(order.id)).resolves.toMatchObject({
        status: OrderStatus.PENDING,
      });
    });
  });

  describe('updateStatus', () => {
    it('moves a paid order to SHIPPED and then DELIVERED', async () => {
      const order = await createOrder();
      await payAndCapture(order.id);

      const shipped = await service.updateStatus(order.id, OrderStatus.SHIPPED);
      expect(shipped.status).toBe(OrderStatus.SHIPPED);

      const delivered = await service.updateStatus(
        order.id,
        OrderStatus.DELIVERED,
      );
      expect(delivered.status).toBe(OrderStatus.DELIVERED);
      await expect(service.findOne(order.id)).resolves.toMatchObject({
        status: OrderStatus.DELIVERED,
      });
    });

    it('returns the order unchanged when the status is the same', async () => {
      const order = await createOrder();

      const result = await service.updateStatus(order.id, OrderStatus.PENDING);

      expect(result.status).toBe(OrderStatus.PENDING);
    });

    it('throws RpcException when shipping an unpaid order', async () => {
      const order = await createOrder();

      await expect(
        service.updateStatus(order.id, OrderStatus.SHIPPED),
      ).rejects.toThrow(RpcException);
    });

    it('throws RpcException when marking an order PAID manually', async () => {
      const order = await createOrder();

      await expect(
        service.updateStatus(order.id, OrderStatus.PAID),
      ).rejects.toThrow(RpcException);
    });

    it('throws RpcException when cancelling via a status update', async () => {
      const order = await createOrder();

      await expect(
        service.updateStatus(order.id, OrderStatus.CANCELLED),
      ).rejects.toThrow(RpcException);
    });

    it('throws RpcException when moving a delivered order backwards', async () => {
      const order = await createOrder();
      await payAndCapture(order.id);
      await service.updateStatus(order.id, OrderStatus.SHIPPED);
      await service.updateStatus(order.id, OrderStatus.DELIVERED);

      await expect(
        service.updateStatus(order.id, OrderStatus.SHIPPED),
      ).rejects.toThrow(RpcException);
    });

    it('throws RpcException for an unknown id', async () => {
      await expect(
        service.updateStatus('missing', OrderStatus.SHIPPED),
      ).rejects.toThrow(RpcException);
    });

    it('throws RpcException when the order is cancelled', async () => {
      const order = await createOrder();
      await service.cancel(order.id);

      await expect(
        service.updateStatus(order.id, OrderStatus.SHIPPED),
      ).rejects.toThrow(RpcException);
    });

    it('blocks shipping while a refund is pending', async () => {
      const order = await createOrder();
      await payAndCapture(order.id);
      paypal.refundCapture.mockRejectedValue(new Error('offline'));
      await expect(service.cancel(order.id)).rejects.toThrow('offline');
      await expect(
        service.updateStatus(order.id, OrderStatus.SHIPPED),
      ).rejects.toThrow(RpcException);
      await expect(
        dataSource.getRepository(OrderEntity).findOneByOrFail({ id: order.id }),
      ).resolves.toMatchObject({ status: OrderStatus.PAID });
    });

    it('rejects a cached order that disappeared before transition', async () => {
      const order = await createOrder();
      await payAndCapture(order.id);
      await service.findOne(order.id);
      await dataSource.getRepository(OrderEntity).delete(order.id);
      await expect(
        service.updateStatus(order.id, OrderStatus.SHIPPED),
      ).rejects.toThrow(RpcException);
    });
  });

  describe('pay', () => {
    it('creates a PayPal order and stores its id on the order', async () => {
      const order = await createOrder();
      paypal.createOrder.mockResolvedValue(makePaypalOrder());

      const payment = await service.pay(order.id);

      expect(paypal.createOrder).toHaveBeenCalledWith(order.id, order.total);
      expect(payment).toEqual({
        orderId: order.id,
        paymentId: 'pp-1',
        paymentStatus: 'CREATED',
        approveUrl: 'https://paypal.test/approve',
      });
      await expect(service.findOne(order.id)).resolves.toMatchObject({
        paymentId: 'pp-1',
        status: OrderStatus.PENDING,
      });
    });

    it('throws RpcException when the order is not pending', async () => {
      const order = await createOrder();
      await payAndCapture(order.id);
      paypal.createOrder.mockClear();

      await expect(service.pay(order.id)).rejects.toBeInstanceOf(RpcException);
      expect(paypal.createOrder).not.toHaveBeenCalled();
    });

    it('throws RpcException for an unknown id', async () => {
      await expect(service.pay('missing')).rejects.toBeInstanceOf(RpcException);
    });

    it('does not attach the payment when the order changes mid-flight', async () => {
      const order = await createOrder();
      productsClient.send.mockImplementation(() => of(makeProduct()));
      paypal.createOrder.mockImplementation(async () => {
        await service.cancel(order.id);
        return makePaypalOrder();
      });

      await expect(service.pay(order.id)).rejects.toBeInstanceOf(RpcException);
      await expect(service.findOne(order.id)).resolves.toMatchObject({
        status: OrderStatus.CANCELLED,
        paymentId: null,
      });
    });
  });

  async function createPaidForOrder() {
    const order = await createOrder();
    paypal.createOrder.mockResolvedValue(makePaypalOrder());
    await service.pay(order.id);
    return order;
  }

  describe('capturePayment', () => {
    it('captures the payment and marks the order as PAID', async () => {
      const order = await createPaidForOrder();
      paypal.captureOrder.mockResolvedValue(makePaypalCapture());

      const paid = await service.capturePayment(order.id);

      expect(paypal.captureOrder).toHaveBeenCalledWith('pp-1');
      expect(paid.status).toBe(OrderStatus.PAID);
      await expect(service.findOne(order.id)).resolves.toMatchObject({
        status: OrderStatus.PAID,
        captureId: 'cap-1',
      });
    });

    it('is idempotent for an already paid order', async () => {
      const order = await createPaidForOrder();
      paypal.captureOrder.mockResolvedValue(makePaypalCapture());
      await service.capturePayment(order.id);
      paypal.captureOrder.mockClear();

      const paid = await service.capturePayment(order.id);

      expect(paid.status).toBe(OrderStatus.PAID);
      expect(paypal.captureOrder).not.toHaveBeenCalled();
    });

    it('throws RpcException when the capture is not completed', async () => {
      const order = await createPaidForOrder();
      paypal.captureOrder.mockResolvedValue(
        makePaypalCapture({ status: 'DECLINED', captureId: null }),
      );

      await expect(service.capturePayment(order.id)).rejects.toBeInstanceOf(
        RpcException,
      );
      await expect(service.findOne(order.id)).resolves.toMatchObject({
        status: OrderStatus.PENDING,
      });
    });

    it('throws RpcException when the order has no payment to capture', async () => {
      const order = await createOrder();

      await expect(service.capturePayment(order.id)).rejects.toBeInstanceOf(
        RpcException,
      );
      expect(paypal.captureOrder).not.toHaveBeenCalled();
    });

    it('throws RpcException when the order is cancelled', async () => {
      const order = await createPaidForOrder();
      productsClient.send.mockImplementation(() => of(makeProduct()));
      await service.cancel(order.id);

      await expect(service.capturePayment(order.id)).rejects.toBeInstanceOf(
        RpcException,
      );
      expect(paypal.captureOrder).not.toHaveBeenCalled();
    });

    it('throws RpcException for an unknown id', async () => {
      await expect(service.capturePayment('missing')).rejects.toBeInstanceOf(
        RpcException,
      );
    });

    it('blocks cancellation while capture is pending', async () => {
      const order = await createPaidForOrder();
      paypal.captureOrder.mockImplementation(async () => {
        await expect(service.cancel(order.id)).rejects.toThrow(RpcException);
        return makePaypalCapture();
      });
      await expect(service.capturePayment(order.id)).resolves.toMatchObject({
        status: OrderStatus.PAID,
      });
      expect(paypal.refundCapture).not.toHaveBeenCalled();
    });

    it('recovers a capture after a lost response', async () => {
      const order = await createPaidForOrder();
      paypal.captureOrder.mockRejectedValueOnce(new Error('response lost'));
      await expect(service.capturePayment(order.id)).rejects.toThrow(
        'response lost',
      );
      expect(
        await dataSource
          .getRepository(OrderOperationEntity)
          .findOneBy({ id: order.id }),
      ).toMatchObject({ kind: 'capture' });
      paypal.captureOrder.mockResolvedValue(makePaypalCapture());
      await service.recoverOperations();
      await expect(service.findOne(order.id)).resolves.toMatchObject({
        status: OrderStatus.PAID,
      });
      expect(await dataSource.getRepository(OrderOperationEntity).count()).toBe(
        0,
      );
    });
  });

  describe('captureByPaymentId', () => {
    it('captures the payment of the order matching the PayPal order id', async () => {
      const order = await createOrder();
      paypal.createOrder.mockResolvedValue(makePaypalOrder());
      paypal.captureOrder.mockResolvedValue(makePaypalCapture());
      await service.pay(order.id);

      const paid = await service.captureByPaymentId('pp-1');

      expect(paid.id).toBe(order.id);
      expect(paid.status).toBe(OrderStatus.PAID);
      expect(paypal.captureOrder).toHaveBeenCalledWith('pp-1');
    });

    it('throws RpcException for an unknown payment id', async () => {
      await expect(service.captureByPaymentId('missing')).rejects.toThrow(
        RpcException,
      );
      expect(paypal.captureOrder).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('cancels a pending order and restocks the products', async () => {
      const order = await createOrder();
      productsClient.send.mockClear();
      productsClient.send.mockImplementation((pattern: string) => {
        if (pattern === PRODUCT_PATTERNS.FIND_ONE) {
          return of(makeProduct({ stock: 3 }));
        }
        return of(makeProduct());
      });

      const cancelled = await service.cancel(order.id);

      expect(cancelled.status).toBe(OrderStatus.CANCELLED);
      expect(productsClient.send).toHaveBeenCalledWith(
        PRODUCT_PATTERNS.RELEASE_STOCK,
        {
          reservationId: order.id,
          legacyItems: [{ productId: 'p-1', quantity: 2 }],
        },
      );
    });

    it('retries a failed stock release when cancellation is repeated', async () => {
      const order = await createOrder();
      productsClient.send.mockReturnValueOnce(
        throwError(() => new Error('down')),
      );
      await expect(service.cancel(order.id)).rejects.toThrow('down');
      productsClient.send.mockReturnValue(of({ success: true }));
      await expect(service.cancel(order.id)).resolves.toMatchObject({
        status: OrderStatus.CANCELLED,
      });
      expect(productsClient.send).toHaveBeenLastCalledWith(
        PRODUCT_PATTERNS.RELEASE_STOCK,
        {
          reservationId: order.id,
          legacyItems: [{ productId: 'p-1', quantity: 2 }],
        },
      );
    });

    it('does not refund when cancelling an unpaid order', async () => {
      const order = await createOrder();
      productsClient.send.mockImplementation(() => of(makeProduct()));

      const cancelled = await service.cancel(order.id);

      expect(cancelled.status).toBe(OrderStatus.CANCELLED);
      expect(paypal.refundCapture).not.toHaveBeenCalled();
    });

    it('refunds the payment when cancelling a paid order', async () => {
      const order = await createOrder();
      await payAndCapture(order.id);
      paypal.refundCapture.mockResolvedValue(makePaypalRefund());
      productsClient.send.mockImplementation(() => of(makeProduct()));

      const cancelled = await service.cancel(order.id);

      expect(paypal.refundCapture).toHaveBeenCalledWith('cap-1');
      expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    });

    it('cancels the order when the refund is still pending', async () => {
      const order = await createOrder();
      await payAndCapture(order.id);
      paypal.refundCapture.mockResolvedValue(
        makePaypalRefund({ status: 'PENDING' }),
      );
      productsClient.send.mockImplementation(() => of(makeProduct()));

      const cancelled = await service.cancel(order.id);

      expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    });

    it('keeps the order PAID when the refund fails', async () => {
      const order = await createOrder();
      await payAndCapture(order.id);
      paypal.refundCapture.mockResolvedValue(
        makePaypalRefund({ status: 'FAILED' }),
      );

      await expect(service.cancel(order.id)).rejects.toBeInstanceOf(
        RpcException,
      );
      await expect(service.findOne(order.id)).resolves.toMatchObject({
        status: OrderStatus.PAID,
      });
    });

    it('throws RpcException when a paid order has no capture to refund', async () => {
      const order = await createOrder();
      paypal.createOrder.mockResolvedValue(
        makePaypalOrder({ approveUrl: null }),
      );
      paypal.captureOrder.mockResolvedValue(
        makePaypalCapture({ captureId: null }),
      );
      await service.pay(order.id);
      await service.capturePayment(order.id);

      await expect(service.cancel(order.id)).rejects.toBeInstanceOf(
        RpcException,
      );
      expect(paypal.refundCapture).not.toHaveBeenCalled();
    });

    it('is idempotent for an already cancelled order', async () => {
      const order = await createOrder();
      productsClient.send.mockImplementation(() => of(makeProduct()));
      await service.cancel(order.id);
      productsClient.send.mockClear();

      const result = await service.cancel(order.id);

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(productsClient.send).toHaveBeenCalledWith(
        PRODUCT_PATTERNS.RELEASE_STOCK,
        expect.objectContaining({ reservationId: order.id }),
      );
    });

    it('throws RpcException when the order is already shipped', async () => {
      const order = await createOrder();
      await payAndCapture(order.id);
      await service.updateStatus(order.id, OrderStatus.SHIPPED);

      await expect(service.cancel(order.id)).rejects.toBeInstanceOf(
        RpcException,
      );
    });

    it('throws RpcException for an unknown id', async () => {
      await expect(service.cancel('missing')).rejects.toBeInstanceOf(
        RpcException,
      );
    });

    it('recovers stock release without another cancellation request', async () => {
      const order = await createOrder();
      productsClient.send.mockReturnValueOnce(
        throwError(() => new Error('offline')),
      );
      await expect(service.cancel(order.id)).rejects.toThrow('offline');
      expect(
        await dataSource.getRepository(OrderEntity).findOneBy({ id: order.id }),
      ).toMatchObject({ status: OrderStatus.CANCELLED });
      expect(
        await dataSource
          .getRepository(OrderOperationEntity)
          .findOneBy({ id: order.id }),
      ).toMatchObject({ kind: 'release' });
      productsClient.send.mockReturnValue(of({ success: true }));
      await service.recoverOperations();
      expect(await dataSource.getRepository(OrderOperationEntity).count()).toBe(
        0,
      );
    });
  });

  describe('order recovery', () => {
    beforeEach(() => {
      // pg-mem cannot execute SKIP LOCKED. The PostgreSQL recovery suite checks lock handling.
      vi.spyOn(SelectQueryBuilder.prototype, 'setOnLocked').mockImplementation(
        function (this: SelectQueryBuilder<ObjectLiteral>) {
          return this;
        },
      );
    });

    const offline = new Error('Products unavailable');
    const shortage = {
      statusCode: 400,
      message: 'Insufficient stock',
      error: 'Bad Request',
    };

    it.each([
      [shortage, new RpcException(shortage)],
      [
        { statusCode: 400, message: 123 },
        { statusCode: 400, message: 123 },
      ],
      [offline, offline],
      [null, null],
    ] as const)(
      'preserves the meaning of a reserve failure %j and compensates',
      async (error, expected) => {
        cartClient.send.mockReturnValue(of(makeCart([makeCartItem()])));
        productsClient.send.mockImplementation((pattern: string) => {
          if (pattern === PRODUCT_PATTERNS.FIND_MANY)
            return of([makeProduct()]);
          if (pattern === PRODUCT_PATTERNS.RESERVE_STOCK)
            return throwError(() => error);
          return of({ success: true });
        });

        await expect(service.create(USER, ADDRESS)).rejects.toEqual(expected);
        expect(productsClient.send).toHaveBeenCalledWith(
          PRODUCT_PATTERNS.RELEASE_STOCK,
          {
            reservationId: expect.any(String),
          },
        );
        expect(await dataSource.getRepository(StockIntentEntity).count()).toBe(
          0,
        );
        expect(await dataSource.getRepository(OrderEntity).count()).toBe(0);
      },
    );

    it('retains the intent if both reserve and compensation fail, then recovers it', async () => {
      cartClient.send.mockReturnValue(of(makeCart([makeCartItem()])));
      productsClient.send.mockImplementation((pattern: string) =>
        pattern === PRODUCT_PATTERNS.FIND_MANY
          ? of([makeProduct()])
          : throwError(() => offline),
      );
      await expect(service.create(USER, ADDRESS)).rejects.toThrow(
        offline.message,
      );
      const intents = dataSource.getRepository(StockIntentEntity);
      expect(await intents.count()).toBe(1);
      await service.recoverStock();
      expect(await intents.count()).toBe(1);
      productsClient.send.mockReturnValue(of({ success: true }));
      await service.recoverStock();
      expect(await intents.count()).toBe(0);
    });

    it('clears a leftover intent for a committed order without releasing its stock', async () => {
      const order = await createOrder();
      const intents = dataSource.getRepository(StockIntentEntity);
      await intents.insert({ id: order.id });
      productsClient.send.mockClear();
      await service.recoverStock();
      expect(await intents.count()).toBe(0);
      expect(productsClient.send).not.toHaveBeenCalled();
    });

    it('does not release a reserve if another worker already cleared its intent', async () => {
      const intents = dataSource.getRepository(StockIntentEntity);
      vi.spyOn(intents, 'find').mockResolvedValueOnce([
        { id: 'missing', createdAt: new Date() },
      ]);
      productsClient.send.mockClear();
      await service.recoverStock();
      expect(productsClient.send).not.toHaveBeenCalled();
    });

    it.each([
      [
        'stock',
        StockIntentEntity,
        (worker: OrdersService) => worker.recoverStock(),
        'Stock recovery scan failed',
      ],
      [
        'operations',
        OrderOperationEntity,
        (worker: OrdersService) => worker.recoverOperations(),
        'Order operation scan failed',
      ],
    ] as const)(
      'logs database failures when scanning %s',
      async (_name, entity, recover, message) => {
        vi.spyOn(
          dataSource.getRepository(entity),
          'find',
        ).mockRejectedValueOnce(new Error('database unavailable'));
        const log = vi
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => undefined);
        await recover(service);
        expect(log).toHaveBeenCalledWith(expect.stringContaining(message));
      },
    );

    it('returns a conflict when the status changes after the initial read', async () => {
      const order = await createOrder();
      await payAndCapture(order.id);
      await service.findOne(order.id);
      await dataSource
        .getRepository(OrderEntity)
        .update(order.id, { status: OrderStatus.DELIVERED });
      await expect(
        service.updateStatus(order.id, OrderStatus.SHIPPED),
      ).rejects.toThrow('was modified concurrently');
    });

    it('rejects capture while a refund is pending', async () => {
      const order = await createOrder();
      await payAndCapture(order.id);
      await dataSource
        .getRepository(OrderOperationEntity)
        .insert({ id: order.id, kind: 'refund' });
      await expect(service.capturePayment(order.id)).rejects.toThrow(
        'Another order operation is pending',
      );
    });

    it('retries a pending capture when requested again', async () => {
      const order = await createPaidForOrder();
      await dataSource
        .getRepository(OrderOperationEntity)
        .insert({ id: order.id, kind: 'capture' });
      paypal.captureOrder.mockResolvedValue(makePaypalCapture());
      await expect(service.capturePayment(order.id)).resolves.toMatchObject({
        status: OrderStatus.PAID,
      });
    });

    it('defers orphaned operations and refund work without a capture ID', async () => {
      const order = await createOrder();
      const operations = dataSource.getRepository(OrderOperationEntity);
      await operations.insert([
        { id: 'missing', kind: 'release' },
        { id: order.id, kind: 'refund' },
      ]);
      const log = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      await service.recoverOperations();
      expect(paypal.refundCapture).not.toHaveBeenCalled();
      const pending = await operations.find();
      expect(pending).toHaveLength(2);
      expect(
        pending.every(
          ({ nextAttemptAt }) => nextAttemptAt.getTime() > Date.now(),
        ),
      ).toBe(true);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('payment cannot be refunded automatically'),
      );
    });

    it('publishes recovered events and skips a capture notification for an already shipped order', async () => {
      const capture = await createPaidForOrder();
      const cancel = await createOrder();
      const shipped = await createOrder();
      await payAndCapture(shipped.id);
      await service.updateStatus(shipped.id, OrderStatus.SHIPPED);
      await dataSource
        .getRepository(OrderEntity)
        .update(cancel.id, { status: OrderStatus.CANCELLED });
      const operations = dataSource.getRepository(OrderOperationEntity);
      await operations.insert([
        { id: capture.id, kind: 'capture' },
        { id: cancel.id, kind: 'release' },
      ]);
      // Another worker can complete its capture after this worker scans due work.
      vi.spyOn(operations, 'find').mockResolvedValueOnce([
        ...(await operations.find()),
        operations.create({ id: shipped.id, kind: 'capture' }),
      ]);
      paypal.captureOrder.mockResolvedValue(makePaypalCapture());
      const publish = vi.fn();
      const worker = new OrdersService(
        dataSource.getRepository(OrderEntity),
        moduleRef.get(SERVICE_NAMES.PRODUCTS),
        moduleRef.get(SERVICE_NAMES.CART),
        moduleRef.get(CacheService),
        moduleRef.get(PaypalService),
        { publish } as unknown as EventBus,
      );
      await worker.recoverOperations();
      expect(publish).toHaveBeenCalledWith(expect.any(OrderPaidEvent));
      expect(publish).toHaveBeenCalledWith(expect.any(OrderCancelledEvent));
      expect(publish).toHaveBeenCalledTimes(2);
    });
  });

  describe('caching', () => {
    it('serves a repeated findOne from the cache', async () => {
      const order = await createOrder();
      const spy = vi.spyOn(dataSource.getRepository(OrderEntity), 'findOneBy');

      await service.findOne(order.id);
      await service.findOne(order.id);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(cacheStore.has(`order:${order.id}`)).toBe(true);
    });

    it('serves a repeated findAll from the cache', async () => {
      await createOrder();
      const spy = vi.spyOn(dataSource.getRepository(OrderEntity), 'find');

      await service.findAll(USER);
      await service.findAll(USER);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(cacheStore.has(`orders:user:${USER}`)).toBe(true);
    });

    it('evicts the user listing cache when an order is created', async () => {
      await service.findAll(USER);
      expect(cacheStore.has(`orders:user:${USER}`)).toBe(true);

      await createOrder();

      expect(cacheStore.has(`orders:user:${USER}`)).toBe(false);
    });

    it('evicts the order cache when its status changes', async () => {
      const order = await createOrder();
      await payAndCapture(order.id);
      await service.findOne(order.id);

      await service.updateStatus(order.id, OrderStatus.SHIPPED);

      expect(cacheStore.has(`order:${order.id}`)).toBe(false);
    });

    it('evicts the order cache when it is cancelled', async () => {
      const order = await createOrder();
      productsClient.send.mockImplementation(() => of(makeProduct()));
      await service.findOne(order.id);

      await service.cancel(order.id);

      expect(cacheStore.has(`order:${order.id}`)).toBe(false);
    });
  });
});
