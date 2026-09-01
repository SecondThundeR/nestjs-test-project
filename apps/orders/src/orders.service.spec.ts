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
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { of, throwError } from 'rxjs';
import type { DataSource } from 'typeorm';
import type { Mock } from 'vitest';

import { createInMemoryCache } from '../../../test/utils/in-memory-cache.js';
import { createInMemoryDataSource } from '../../../test/utils/in-memory-database.js';
import {
  makePaypalCapture,
  makePaypalOrder,
  makePaypalRefund,
} from '../../../test/utils/paypal.js';
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
  let cacheStore: Map<string, unknown>;

  beforeEach(async () => {
    productsClient = { send: vi.fn() };
    cartClient = { send: vi.fn() };
    paypal = {
      createOrder: vi.fn(),
      captureOrder: vi.fn(),
      refundCapture: vi.fn(),
    };
    dataSource = await createInMemoryDataSource([OrderEntity]);
    const { service: cacheService, store } = createInMemoryCache();
    cacheStore = store;

    const moduleRef = await Test.createTestingModule({
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

    it('decrements product stock for each ordered item', async () => {
      await createOrder();

      expect(productsClient.send).toHaveBeenCalledWith(
        PRODUCT_PATTERNS.UPDATE,
        {
          id: 'p-1',
          data: { stock: 3 },
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

    it('throws a conflict when the order is modified concurrently', async () => {
      const order = await createOrder();
      await payAndCapture(order.id);
      vi.spyOn(
        dataSource.getRepository(OrderEntity),
        'update',
      ).mockResolvedValue({ affected: 0, raw: [], generatedMaps: [] });

      const error: unknown = await service
        .updateStatus(order.id, OrderStatus.SHIPPED)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RpcException);
      expect((error as RpcException).getError()).toMatchObject({
        statusCode: 409,
      });
    });

    it('throws not found when the order disappears mid-transition', async () => {
      const order = await createOrder();
      await payAndCapture(order.id);
      await service.findOne(order.id);
      vi.spyOn(
        dataSource.getRepository(OrderEntity),
        'findOneBy',
      ).mockResolvedValue(null);

      const error: unknown = await service
        .updateStatus(order.id, OrderStatus.SHIPPED)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RpcException);
      expect((error as RpcException).getError()).toMatchObject({
        statusCode: 404,
      });
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

  describe('capturePayment', () => {
    async function createPaidForOrder() {
      const order = await createOrder();
      paypal.createOrder.mockResolvedValue(makePaypalOrder());
      await service.pay(order.id);
      return order;
    }

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

    it('refunds the charge when the order changes mid-capture', async () => {
      const order = await createPaidForOrder();
      productsClient.send.mockImplementation(() => of(makeProduct()));
      paypal.captureOrder.mockImplementation(async () => {
        await service.cancel(order.id);
        return makePaypalCapture();
      });
      paypal.refundCapture.mockResolvedValue(makePaypalRefund());

      await expect(service.capturePayment(order.id)).rejects.toBeInstanceOf(
        RpcException,
      );
      expect(paypal.refundCapture).toHaveBeenCalledWith('cap-1');
      await expect(service.findOne(order.id)).resolves.toMatchObject({
        status: OrderStatus.CANCELLED,
      });
    });

    it('does not refund a conflicting capture that has no capture id', async () => {
      const order = await createPaidForOrder();
      productsClient.send.mockImplementation(() => of(makeProduct()));
      paypal.captureOrder.mockImplementation(async () => {
        await service.cancel(order.id);
        return makePaypalCapture({ captureId: null });
      });

      await expect(service.capturePayment(order.id)).rejects.toBeInstanceOf(
        RpcException,
      );
      expect(paypal.refundCapture).not.toHaveBeenCalled();
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
        PRODUCT_PATTERNS.UPDATE,
        {
          id: 'p-1',
          data: { stock: 5 },
        },
      );
    });

    it('skips restock for items whose product can no longer be fetched', async () => {
      const order = await createOrder();
      productsClient.send.mockClear();
      productsClient.send.mockReturnValue(throwError(() => new Error('down')));

      const cancelled = await service.cancel(order.id);

      expect(cancelled.status).toBe(OrderStatus.CANCELLED);
      expect(productsClient.send).toHaveBeenCalledWith(
        PRODUCT_PATTERNS.FIND_ONE,
        'p-1',
      );
      expect(productsClient.send).not.toHaveBeenCalledWith(
        PRODUCT_PATTERNS.UPDATE,
        expect.anything(),
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
      expect(productsClient.send).not.toHaveBeenCalled();
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

    it('throws a conflict when the order is modified concurrently', async () => {
      const order = await createOrder();
      vi.spyOn(
        dataSource.getRepository(OrderEntity),
        'update',
      ).mockResolvedValue({ affected: 0, raw: [], generatedMaps: [] });

      const error: unknown = await service
        .cancel(order.id)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RpcException);
      expect((error as RpcException).getError()).toMatchObject({
        statusCode: 409,
      });
      expect(productsClient.send).not.toHaveBeenCalledWith(
        PRODUCT_PATTERNS.FIND_ONE,
        expect.anything(),
      );
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
