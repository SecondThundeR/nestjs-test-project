import type { Server } from 'node:http';

import { authConfig, SERVICE_NAMES } from '@app/config';
import {
  AUTH_PATTERNS,
  type AuthResult,
  CART_PATTERNS,
  type Cart,
  type Order,
  ORDERS_PATTERNS,
  OrderStatus,
  type Product,
  PRODUCT_PATTERNS,
  type PublicUser,
  UserRole,
  USERS_PATTERNS,
} from '@app/domains';
import {
  type INestApplication,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import request from 'supertest';

import { standardSchemaDocumentOptions } from './../src/common/openapi.js';
import { GatewayModule } from './../src/gateway.module.js';

const timestamp = '2026-06-15T10:00:00.000Z';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p-1',
    name: 'Widget',
    description: '',
    price: 10,
    stock: 5,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function makeCart(overrides: Partial<Cart> = {}): Cart {
  return {
    userId: 'alice',
    items: [],
    total: 0,
    updatedAt: timestamp,
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o-1',
    userId: 'alice',
    items: [],
    total: 0,
    status: OrderStatus.PENDING,
    shippingAddress: '1 Test Street',
    paymentId: null,
    captureId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function makePublicUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: 'alice',
    email: 'alice@example.com',
    name: 'Alice',
    role: UserRole.REGULAR,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function makeAuthResult(overrides: Partial<AuthResult> = {}): AuthResult {
  return {
    accessToken: 'jwt-token',
    refreshToken: 'refresh-token',
    user: makePublicUser({
      id: 'u-1',
      email: 'jane@example.com',
      name: 'Jane',
    }),
    ...overrides,
  };
}

describe('Gateway (e2e)', () => {
  let app: INestApplication;
  const products = { send: vi.fn(), emit: vi.fn() };
  const cart = { send: vi.fn(), emit: vi.fn() };
  const orders = { send: vi.fn(), emit: vi.fn() };
  const users = { send: vi.fn(), emit: vi.fn() };
  const auth = { send: vi.fn(), emit: vi.fn() };

  const jwtService = new JwtService({ secret: authConfig().secret });
  const aliceToken = jwtService.sign({
    sub: 'alice',
    email: 'alice@example.com',
    sid: 'session-1',
    role: UserRole.REGULAR,
  });
  const bearer = `Bearer ${aliceToken}`;
  const adminToken = jwtService.sign({
    sub: 'admin',
    email: 'admin@example.com',
    sid: 'session-admin',
    role: UserRole.ADMIN,
  });
  const adminBearer = `Bearer ${adminToken}`;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [GatewayModule],
    })
      .overrideProvider(SERVICE_NAMES.PRODUCTS)
      .useValue(products)
      .overrideProvider(SERVICE_NAMES.CART)
      .useValue(cart)
      .overrideProvider(SERVICE_NAMES.ORDERS)
      .useValue(orders)
      .overrideProvider(SERVICE_NAMES.USERS)
      .useValue(users)
      .overrideProvider(SERVICE_NAMES.AUTH)
      .useValue(auth)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new StandardSchemaValidationPipe({ transform: true }));
    app.useGlobalInterceptors(
      new StandardSchemaSerializerInterceptor(app.get(Reflector)),
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
    users.send.mockReset();
    auth.send.mockReset();
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
      const list = [makeProduct()];
      products.send.mockReturnValue(of(list));

      const res = await http().get('/api/product').expect(200);

      expect(res.body).toEqual(list);
      expect(products.send).toHaveBeenCalledWith(PRODUCT_PATTERNS.FIND_ALL, {});
    });

    it('POST /api/product forwards a valid CREATE payload', async () => {
      const created = makeProduct();
      auth.send.mockReturnValue(of({ id: 'admin' }));
      products.send.mockReturnValue(of(created));

      const res = await http()
        .post('/api/product')
        .set('authorization', adminBearer)
        .send({ name: 'Widget', price: 10 })
        .expect(201);

      expect(res.body).toEqual(created);
      expect(products.send).toHaveBeenCalledWith(PRODUCT_PATTERNS.CREATE, {
        name: 'Widget',
        price: 10,
      });
    });

    it('strips undeclared fields from product responses', async () => {
      const product = makeProduct();
      products.send.mockReturnValue(of({ ...product, internalOnly: 'secret' }));

      const res = await http().get('/api/product/p-1').expect(200);

      expect(res.body).toEqual(product);
      expect(res.body).not.toHaveProperty('internalOnly');
    });

    it('generates request and response OpenAPI schemas from Zod', () => {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('Test').setVersion('1').build(),
        standardSchemaDocumentOptions,
      );

      expect(document.paths['/api/product']?.post).toMatchObject({
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string', minLength: 2 },
                  price: { type: 'number', minimum: 0 },
                },
              },
            },
          },
        },
        responses: {
          201: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { id: { type: 'string' } },
                },
              },
            },
          },
        },
      });
    });

    it('POST /api/product requires authentication', async () => {
      await http()
        .post('/api/product')
        .send({ name: 'Widget', price: 10 })
        .expect(401);

      expect(products.send).not.toHaveBeenCalled();
    });

    it('POST /api/product forbids a non-admin user', async () => {
      auth.send.mockReturnValue(of({ id: 'alice' }));

      await http()
        .post('/api/product')
        .set('authorization', bearer)
        .send({ name: 'Widget', price: 10 })
        .expect(403);

      expect(products.send).not.toHaveBeenCalled();
    });

    it('POST /api/product rejects an invalid body with 400', async () => {
      auth.send.mockReturnValue(of({ id: 'admin' }));

      await http()
        .post('/api/product')
        .set('authorization', adminBearer)
        .send({ name: 'x', price: -1 })
        .expect(400);

      expect(products.send).not.toHaveBeenCalled();
    });

    it('POST /api/product rejects unknown properties with 400', async () => {
      auth.send.mockReturnValue(of({ id: 'admin' }));

      await http()
        .post('/api/product')
        .set('authorization', adminBearer)
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

  describe('cart (JWT auth)', () => {
    it('resolves the user from the bearer token after session verification', async () => {
      auth.send.mockReturnValue(of({ id: 'alice' }));
      cart.send.mockReturnValue(of(makeCart()));

      await http().get('/api/cart').set('authorization', bearer).expect(200);

      expect(auth.send).toHaveBeenCalledWith(AUTH_PATTERNS.VERIFY, 'session-1');
      expect(cart.send).toHaveBeenCalledWith(CART_PATTERNS.GET, 'alice');
    });

    it('rejects a token with a revoked session with 401', async () => {
      auth.send.mockReturnValue(
        throwError(() => ({
          statusCode: 401,
          message: 'Invalid or expired token',
          error: 'Unauthorized',
        })),
      );

      await http().get('/api/cart').set('authorization', bearer).expect(401);

      expect(cart.send).not.toHaveBeenCalled();
    });

    it('rejects an unauthenticated request with 401', async () => {
      await http().get('/api/cart').expect(401);

      expect(cart.send).not.toHaveBeenCalled();
    });

    it('rejects a request with an invalid token with 401', async () => {
      await http()
        .get('/api/cart')
        .set('authorization', 'Bearer not-a-token')
        .expect(401);

      expect(cart.send).not.toHaveBeenCalled();
    });
  });

  describe('orders (JWT auth)', () => {
    it('forwards the token user and shippingAddress', async () => {
      auth.send.mockReturnValue(of({ id: 'alice' }));
      orders.send.mockReturnValue(of(makeOrder()));

      await http()
        .post('/api/orders')
        .set('authorization', bearer)
        .send({ shippingAddress: '1 Test Street' })
        .expect(201);

      expect(orders.send).toHaveBeenCalledWith(ORDERS_PATTERNS.CREATE, {
        userId: 'alice',
        shippingAddress: '1 Test Street',
      });
    });

    it('rejects an unauthenticated request with 401', async () => {
      await http()
        .post('/api/orders')
        .send({ shippingAddress: '1 Test Street' })
        .expect(401);

      expect(orders.send).not.toHaveBeenCalled();
    });

    it('PATCH /api/orders/:id/status lets an admin change any order, unscoped to an owner', async () => {
      auth.send.mockReturnValue(of({ id: 'admin' }));
      orders.send.mockReturnValue(
        of(makeOrder({ status: OrderStatus.SHIPPED })),
      );

      await http()
        .patch('/api/orders/o-1/status')
        .set('authorization', adminBearer)
        .send({ status: 'SHIPPED' })
        .expect(200);

      expect(orders.send).toHaveBeenCalledWith(ORDERS_PATTERNS.UPDATE_STATUS, {
        id: 'o-1',
        status: 'SHIPPED',
      });
    });

    it('PATCH /api/orders/:id/status forbids a non-admin user', async () => {
      auth.send.mockReturnValue(of({ id: 'alice' }));

      await http()
        .patch('/api/orders/o-1/status')
        .set('authorization', bearer)
        .send({ status: 'SHIPPED' })
        .expect(403);

      expect(orders.send).not.toHaveBeenCalled();
    });

    it('PATCH /api/orders/:id/status rejects an unauthenticated request with 401', async () => {
      await http()
        .patch('/api/orders/o-1/status')
        .send({ status: 'SHIPPED' })
        .expect(401);

      expect(orders.send).not.toHaveBeenCalled();
    });
  });

  describe('auth (public auth routes)', () => {
    it('POST /api/auth/register forwards the body and returns the auth result', async () => {
      const result = makeAuthResult();
      auth.send.mockReturnValue(of(result));

      const res = await http()
        .post('/api/auth/register')
        .send({
          email: 'jane@example.com',
          name: 'Jane',
          password: 'password123',
        })
        .expect(201);

      expect(res.body).toEqual(result);
      expect(auth.send).toHaveBeenCalledWith(AUTH_PATTERNS.REGISTER, {
        email: 'jane@example.com',
        name: 'Jane',
        password: 'password123',
      });
    });

    it('POST /api/auth/login is reachable without a token', async () => {
      const result = makeAuthResult();
      auth.send.mockReturnValue(of(result));

      await http()
        .post('/api/auth/login')
        .send({ email: 'jane@example.com', password: 'password123' })
        .expect(201);

      expect(auth.send).toHaveBeenCalledWith(AUTH_PATTERNS.LOGIN, {
        email: 'jane@example.com',
        password: 'password123',
      });
    });

    it('POST /api/auth/refresh is reachable without a token', async () => {
      const result = makeAuthResult({
        accessToken: 'new-jwt-token',
        refreshToken: 'new-refresh-token',
      });
      auth.send.mockReturnValue(of(result));

      const res = await http()
        .post('/api/auth/refresh')
        .send({ refreshToken: 'old-refresh-token' })
        .expect(201);

      expect(res.body).toEqual(result);
      expect(auth.send).toHaveBeenCalledWith(AUTH_PATTERNS.REFRESH, {
        refreshToken: 'old-refresh-token',
      });
    });

    it('POST /api/auth/refresh rejects an empty body with 400', async () => {
      await http().post('/api/auth/refresh').send({}).expect(400);

      expect(auth.send).not.toHaveBeenCalled();
    });

    it('POST /api/auth/logout forwards the session id from the token', async () => {
      auth.send.mockImplementation((pattern: string) =>
        pattern === AUTH_PATTERNS.VERIFY
          ? of({ id: 'alice' })
          : of({ success: true }),
      );

      const res = await http()
        .post('/api/auth/logout')
        .set('authorization', bearer)
        .expect(201);

      expect(res.body).toEqual({ success: true });
      expect(auth.send).toHaveBeenCalledWith(AUTH_PATTERNS.LOGOUT, 'session-1');
    });

    it('POST /api/auth/logout rejects an unauthenticated request with 401', async () => {
      await http().post('/api/auth/logout').expect(401);

      expect(auth.send).not.toHaveBeenCalled();
    });
  });

  describe('users (whoami)', () => {
    it('GET /api/users/me returns the current user', async () => {
      const user = makePublicUser();
      auth.send.mockReturnValue(of(user));
      users.send.mockReturnValue(of(user));

      const res = await http()
        .get('/api/users/me')
        .set('authorization', bearer)
        .expect(200);

      expect(res.body).toEqual(user);
      expect(users.send).toHaveBeenCalledWith(
        USERS_PATTERNS.FIND_BY_ID,
        'alice',
      );
    });

    it('GET /api/users/me responds 404 when the user no longer exists', async () => {
      auth.send.mockReturnValue(of({ id: 'alice' }));
      users.send.mockReturnValue(of(null));

      await http()
        .get('/api/users/me')
        .set('authorization', bearer)
        .expect(404);
    });

    it('GET /api/users/me rejects an unauthenticated request with 401', async () => {
      await http().get('/api/users/me').expect(401);

      expect(users.send).not.toHaveBeenCalled();
    });
  });
});
