import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import {
  CART_PATTERNS,
  OrderStatus,
  PRODUCT_PATTERNS,
  SERVICE_NAMES,
  type Cart,
  type CartItem,
  type Product,
} from '@app/contracts';
import { OrdersService } from './orders.service';

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
  let productsClient: { send: jest.Mock };
  let cartClient: { send: jest.Mock };

  beforeEach(async () => {
    productsClient = { send: jest.fn() };
    cartClient = { send: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: SERVICE_NAMES.PRODUCTS, useValue: productsClient },
        { provide: SERVICE_NAMES.CART, useValue: cartClient },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
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

    it('clears the cart after creating the order', async () => {
      await createOrder();

      expect(cartClient.send).toHaveBeenCalledWith(CART_PATTERNS.CLEAR, USER);
    });

    it('persists the order so it can be retrieved afterwards', async () => {
      const order = await createOrder();

      expect(service.findOne(order.id)).toBe(order);
      expect(service.findAll(USER)).toContainEqual(order);
    });

    it('throws BadRequestException when the cart is empty', async () => {
      cartClient.send.mockReturnValue(of(makeCart([])));

      await expect(service.create(USER, ADDRESS)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException when a product no longer exists', async () => {
      cartClient.send.mockReturnValue(of(makeCart([makeCartItem()])));
      productsClient.send.mockReturnValue(of([]));

      await expect(service.create(USER, ADDRESS)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException when stock is insufficient', async () => {
      cartClient.send.mockReturnValue(
        of(makeCart([makeCartItem({ quantity: 10 })])),
      );
      productsClient.send.mockReturnValue(of([makeProduct({ stock: 3 })]));

      await expect(service.create(USER, ADDRESS)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('returns an empty list when there are no orders', () => {
      expect(service.findAll()).toEqual([]);
    });

    it('filters by userId when one is provided', async () => {
      const order = await createOrder();

      expect(service.findAll(USER)).toEqual([order]);
      expect(service.findAll('someone-else')).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for an unknown id', () => {
      expect(() => service.findOne('missing')).toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('updates the status of an existing order', async () => {
      const order = await createOrder();

      const updated = service.updateStatus(order.id, OrderStatus.SHIPPED);

      expect(updated.status).toBe(OrderStatus.SHIPPED);
      expect(service.findOne(order.id).status).toBe(OrderStatus.SHIPPED);
    });

    it('throws NotFoundException for an unknown id', () => {
      expect(() => service.updateStatus('missing', OrderStatus.PAID)).toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the order is cancelled', async () => {
      const order = await createOrder();
      await service.cancel(order.id);

      expect(() => service.updateStatus(order.id, OrderStatus.PAID)).toThrow(
        BadRequestException,
      );
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

    it('is idempotent for an already cancelled order', async () => {
      const order = await createOrder();
      productsClient.send.mockImplementation(() => of(makeProduct()));
      await service.cancel(order.id);
      productsClient.send.mockClear();

      const result = await service.cancel(order.id);

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(productsClient.send).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the order is already shipped', async () => {
      const order = await createOrder();
      service.updateStatus(order.id, OrderStatus.SHIPPED);

      await expect(service.cancel(order.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws NotFoundException for an unknown id', async () => {
      await expect(service.cancel('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
