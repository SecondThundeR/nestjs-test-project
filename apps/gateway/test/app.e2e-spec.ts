import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import request from 'supertest';
import type { Server } from 'node:http';
import {
  CART_PATTERNS,
  ORDERS_PATTERNS,
  PRODUCT_PATTERNS,
  SERVICE_NAMES,
} from '@app/contracts';
import { GatewayModule } from './../src/gateway.module';

describe('Gateway (e2e)', () => {
  let app: INestApplication;
  const products = { send: jest.fn(), emit: jest.fn() };
  const cart = { send: jest.fn(), emit: jest.fn() };
  const orders = { send: jest.fn(), emit: jest.fn() };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [GatewayModule],
    })
      .overrideProvider(SERVICE_NAMES.PRODUCTS)
      .useValue(products)
      .overrideProvider(SERVICE_NAMES.CART)
      .useValue(cart)
      .overrideProvider(SERVICE_NAMES.ORDERS)
      .useValue(orders)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    products.send.mockReset();
    cart.send.mockReset();
    orders.send.mockReset();
  });

  const http = () => request(app.getHttpServer() as Server);

  describe('health', () => {
    it('GET /api/health reports ok', async () => {
      const res = await http().get('/api/health').expect(200);

      expect(res.body).toMatchObject({ status: 'ok', service: 'gateway' });
    });
  });

  describe('products', () => {
    it('GET /api/product forwards FIND_ALL and returns the result', async () => {
      const list = [{ id: 'p-1', name: 'Widget' }];
      products.send.mockReturnValue(of(list));

      const res = await http().get('/api/product').expect(200);

      expect(res.body).toEqual(list);
      expect(products.send).toHaveBeenCalledWith(PRODUCT_PATTERNS.FIND_ALL, {});
    });

    it('POST /api/product forwards a valid CREATE payload', async () => {
      const created = { id: 'p-1', name: 'Widget', price: 10 };
      products.send.mockReturnValue(of(created));

      const res = await http()
        .post('/api/product')
        .send({ name: 'Widget', price: 10 })
        .expect(201);

      expect(res.body).toEqual(created);
      expect(products.send).toHaveBeenCalledWith(PRODUCT_PATTERNS.CREATE, {
        name: 'Widget',
        price: 10,
      });
    });

    it('POST /api/product rejects an invalid body with 400', async () => {
      await http()
        .post('/api/product')
        .send({ name: 'x', price: -1 })
        .expect(400);

      expect(products.send).not.toHaveBeenCalled();
    });

    it('POST /api/product rejects unknown properties with 400', async () => {
      await http()
        .post('/api/product')
        .send({ name: 'Widget', price: 10, hacked: true })
        .expect(400);

      expect(products.send).not.toHaveBeenCalled();
    });

    it('maps an RPC NotFound error to a 404 response', async () => {
      products.send.mockReturnValue(
        throwError(() => ({
          statusCode: 404,
          message: 'Product missing not found',
          error: 'Not Found',
        })),
      );

      const res = await http().get('/api/product/missing').expect(404);

      expect(res.body).toMatchObject({
        statusCode: 404,
        message: 'Product missing not found',
        error: 'Not Found',
      });
    });
  });

  describe('cart (user resolution)', () => {
    it('uses the x-user-id header when provided', async () => {
      cart.send.mockReturnValue(of({ userId: 'alice', items: [] }));

      await http().get('/api/cart').set('x-user-id', 'alice').expect(200);

      expect(cart.send).toHaveBeenCalledWith(CART_PATTERNS.GET, 'alice');
    });

    it('falls back to demo-user when no header is present', async () => {
      cart.send.mockReturnValue(of({ userId: 'demo-user', items: [] }));

      await http().get('/api/cart').expect(200);

      expect(cart.send).toHaveBeenCalledWith(CART_PATTERNS.GET, 'demo-user');
    });
  });

  describe('orders', () => {
    it('POST /api/orders forwards userId and shippingAddress', async () => {
      orders.send.mockReturnValue(of({ id: 'o-1' }));

      await http()
        .post('/api/orders')
        .set('x-user-id', 'alice')
        .send({ shippingAddress: '1 Test Street' })
        .expect(201);

      expect(orders.send).toHaveBeenCalledWith(ORDERS_PATTERNS.CREATE, {
        userId: 'alice',
        shippingAddress: '1 Test Street',
      });
    });
  });
});
