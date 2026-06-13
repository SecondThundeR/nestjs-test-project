import { Test } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { of, throwError } from 'rxjs';
import request from 'supertest';
import type { Server } from 'node:http';
import {
  AUTH_PATTERNS,
  CART_PATTERNS,
  ORDERS_PATTERNS,
  PRODUCT_PATTERNS,
  USERS_PATTERNS,
} from '@app/domains';
import { authConfig, SERVICE_NAMES } from '@app/config';
import { GatewayModule } from './../src/gateway.module';

describe('Gateway (e2e)', () => {
  let app: INestApplication;
  const products = { send: jest.fn(), emit: jest.fn() };
  const cart = { send: jest.fn(), emit: jest.fn() };
  const orders = { send: jest.fn(), emit: jest.fn() };
  const users = { send: jest.fn(), emit: jest.fn() };
  const auth = { send: jest.fn(), emit: jest.fn() };

  const jwtService = new JwtService({ secret: authConfig().secret });
  const aliceToken = jwtService.sign({
    sub: 'alice',
    email: 'alice@example.com',
    sid: 'session-1',
  });
  const bearer = `Bearer ${aliceToken}`;

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

  describe('cart (JWT auth)', () => {
    it('resolves the user from the bearer token after session verification', async () => {
      auth.send.mockReturnValue(of({ id: 'alice' }));
      cart.send.mockReturnValue(of({ userId: 'alice', items: [] }));

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
      orders.send.mockReturnValue(of({ id: 'o-1' }));

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
  });

  describe('auth (public auth routes)', () => {
    it('POST /api/auth/register forwards the body and returns the auth result', async () => {
      const result = {
        accessToken: 'jwt-token',
        refreshToken: 'refresh-token',
        user: { id: 'u-1', email: 'jane@example.com', name: 'Jane' },
      };
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
      const result = {
        accessToken: 'jwt-token',
        refreshToken: 'refresh-token',
        user: { id: 'u-1', email: 'jane@example.com', name: 'Jane' },
      };
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
      const result = {
        accessToken: 'new-jwt-token',
        refreshToken: 'new-refresh-token',
        user: { id: 'u-1', email: 'jane@example.com', name: 'Jane' },
      };
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
      const user = { id: 'alice', email: 'alice@example.com', name: 'Alice' };
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
