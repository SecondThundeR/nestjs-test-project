import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { authConfig, SERVICE_NAMES } from '@app/config';
import {
  type Order,
  type OrderPayment,
  OrderStatus,
  UserRole,
} from '@app/domains';
import {
  type INestApplication,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';
import request from 'supertest';

import { GatewayModule } from './../src/gateway.module.js';

const require = createRequire(import.meta.url);
const jestOpenAPI = (
  require('jest-openapi') as { default: (specPath: string) => void }
).default;

jestOpenAPI(join(import.meta.dirname, '../src/orders/orders.openapi.yaml'));

const order: Order = {
  id: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  items: [
    {
      productId: '33333333-3333-3333-3333-333333333333',
      name: 'Logitech PRO X2 SUPERSTRIKE',
      price: 179.99,
      quantity: 2,
      subtotal: 359.98,
    },
  ],
  total: 359.98,
  status: OrderStatus.PENDING,
  shippingAddress: 'Kirova 1, Minsk',
  paymentId: null,
  captureId: null,
  createdAt: '2026-06-15T10:00:00.000Z',
  updatedAt: '2026-06-15T10:00:00.000Z',
};

const payment: OrderPayment = {
  orderId: order.id,
  paymentId: 'pp-1',
  paymentStatus: 'CREATED',
  approveUrl: 'https://paypal.test/approve',
};

describe('Orders API contract (Schema First)', () => {
  let app: INestApplication;
  const orders = { send: vi.fn(), emit: vi.fn() };
  const auth = { send: vi.fn(), emit: vi.fn() };
  const noopProxy = { send: vi.fn(), emit: vi.fn() };

  const jwt = new JwtService({ secret: authConfig().secret });
  const bearer = `Bearer ${jwt.sign({ sub: order.userId, email: 'u@example.com', sid: 'session-1', role: UserRole.REGULAR })}`;
  const adminBearer = `Bearer ${jwt.sign({ sub: 'admin', email: 'admin@example.com', sid: 'session-admin', role: UserRole.ADMIN })}`;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [GatewayModule],
    })
      .overrideProvider(SERVICE_NAMES.ORDERS)
      .useValue(orders)
      .overrideProvider(SERVICE_NAMES.AUTH)
      .useValue(auth)
      .overrideProvider(SERVICE_NAMES.PRODUCTS)
      .useValue(noopProxy)
      .overrideProvider(SERVICE_NAMES.CART)
      .useValue(noopProxy)
      .overrideProvider(SERVICE_NAMES.USERS)
      .useValue(noopProxy)
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
    orders.send.mockReset();
    auth.send.mockReset();
    auth.send.mockReturnValue(of({ id: order.userId }));
  });

  const http = () => request(app.getHttpServer() as Server);

  it('POST /api/orders satisfies the contract', async () => {
    orders.send.mockReturnValue(of(order));

    const res = await http()
      .post('/api/orders')
      .set('authorization', bearer)
      .send({ shippingAddress: order.shippingAddress })
      .expect(201);

    expect(res).toSatisfyApiSpec();
  });

  it('GET /api/orders satisfies the contract', async () => {
    orders.send.mockReturnValue(of([order]));

    const res = await http()
      .get('/api/orders')
      .set('authorization', bearer)
      .expect(200);

    expect(res).toSatisfyApiSpec();
  });

  it('GET /api/orders/{id} satisfies the contract', async () => {
    orders.send.mockReturnValue(of(order));

    const res = await http()
      .get(`/api/orders/${order.id}`)
      .set('authorization', bearer)
      .expect(200);

    expect(res).toSatisfyApiSpec();
  });

  it('PATCH /api/orders/{id}/status satisfies the contract', async () => {
    auth.send.mockReturnValue(of({ id: 'admin' }));
    orders.send.mockReturnValue(of({ ...order, status: OrderStatus.SHIPPED }));

    const res = await http()
      .patch(`/api/orders/${order.id}/status`)
      .set('authorization', adminBearer)
      .send({ status: OrderStatus.SHIPPED })
      .expect(200);

    expect(res).toSatisfyApiSpec();
  });

  it('PATCH /api/orders/{id}/cancel satisfies the contract', async () => {
    orders.send.mockReturnValue(
      of({ ...order, status: OrderStatus.CANCELLED }),
    );

    const res = await http()
      .patch(`/api/orders/${order.id}/cancel`)
      .set('authorization', bearer)
      .expect(200);

    expect(res).toSatisfyApiSpec();
  });

  it('POST /api/orders/{id}/pay satisfies the contract', async () => {
    orders.send.mockReturnValue(of(payment));

    const res = await http()
      .post(`/api/orders/${order.id}/pay`)
      .set('authorization', bearer)
      .expect(201);

    expect(res).toSatisfyApiSpec();
  });

  it('POST /api/orders/{id}/capture satisfies the contract', async () => {
    orders.send.mockReturnValue(of({ ...order, status: OrderStatus.PAID }));

    const res = await http()
      .post(`/api/orders/${order.id}/capture`)
      .set('authorization', bearer)
      .expect(201);

    expect(res).toSatisfyApiSpec();
  });

  it('GET /api/orders/payment/return satisfies the contract', async () => {
    orders.send.mockReturnValue(of({ ...order, status: OrderStatus.PAID }));

    const res = await http()
      .get('/api/orders/payment/return')
      .query({ token: 'pp-1' })
      .expect(200);

    expect(res).toSatisfyApiSpec();
  });

  it('GET /api/orders/payment/cancel satisfies the contract', async () => {
    const res = await http().get('/api/orders/payment/cancel').expect(200);

    expect(res).toSatisfyApiSpec();
  });
});
