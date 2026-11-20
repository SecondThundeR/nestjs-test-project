import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { expect, it } from 'vitest';

it('enforces HTTP validation, role restrictions and ownership at Gateway', async () => {
  const url = process.env.E2E_API_URL;
  if (!url) throw new Error('Start the E2E stack with pnpm run test:e2e');
  const api = request(url);
  expect((await api.get('/health').expect(200)).body).toMatchObject({
    status: 'ok',
    service: 'gateway',
  });
  const docs = request(new URL(url).origin);
  const { body: productsSpec } = await docs
    .get('/api/docs/products-json')
    .expect(200);
  expect(productsSpec.info.title).toBe('Products API');
  expect(productsSpec.paths).toHaveProperty('/api/v1/product');
  expect(productsSpec.paths).not.toHaveProperty('/api/v1/orders');
  const { body: ordersSpec } = await docs
    .get('/api/docs/orders-json')
    .expect(200);
  expect(ordersSpec.paths).toHaveProperty('/orders');
  const admin = await api
    .post('/auth/login')
    .send({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    })
    .expect(201);
  const adminAuth = `Bearer ${admin.body.accessToken}`;
  async function register(name: string) {
    const { body } = await api
      .post('/auth/register')
      .send({
        email: `contract-${randomUUID()}@example.test`,
        name,
        password: randomUUID(),
      })
      .expect(201);
    expect(body.user).toMatchObject({ role: 'regular' });
    expect(body.user).not.toHaveProperty('passwordHash');
    return `Bearer ${body.accessToken}`;
  }

  const [ownerAuth, otherAuth] = await Promise.all([
    register('Owner'),
    register('Other buyer'),
  ]);
  expect(
    (await api.get('/users/me').set('Authorization', ownerAuth).expect(200))
      .body,
  ).toMatchObject({ name: 'Owner', role: 'regular' });
  const productDetails = { name: 'Contract product', price: 12.34, stock: 5 };
  const { body: product } = await api
    .post('/product')
    .set('Authorization', adminAuth)
    .send(productDetails)
    .expect(201);
  const productUrl = `/product/${product.id}`;
  expect((await api.get(productUrl).expect(200)).body).toMatchObject(
    productDetails,
  );
  const item = { productId: product.id, quantity: 1 };
  await api
    .post('/cart/items')
    .set('Authorization', ownerAuth)
    .send(item)
    .expect(201);
  expect(
    (await api.get('/cart').set('Authorization', otherAuth).expect(200)).body
      .items,
  ).toEqual([]);
  const orderDetails = { shippingAddress: 'Contract test address' };
  const { body: order } = await api
    .post('/orders')
    .set('Authorization', ownerAuth)
    .send(orderDetails)
    .expect(201);
  const orderUrl = `/orders/${order.id}`;

  const protectedRoutes = [
    ['get', '/users/me'],
    ['post', '/auth/logout'],
    ['get', '/events'],
    ['get', '/cart'],
    ['post', '/cart/items', item],
    ['patch', `/cart/items/${product.id}`, { quantity: 1 }],
    ['delete', `/cart/items/${product.id}`],
    ['delete', '/cart'],
    ['get', '/orders'],
    ['post', '/orders', orderDetails],
    ['get', orderUrl],
    ['patch', `${orderUrl}/cancel`],
    ['post', `${orderUrl}/pay`],
    ['post', `${orderUrl}/capture`],
  ] as const;
  const adminRoutes = [
    ['post', '/product', productDetails],
    ['patch', productUrl, { price: 13 }],
    ['delete', productUrl],
    ['patch', `${orderUrl}/status`, { status: 'PENDING' }],
  ] as const;

  async function expectError(
    route: readonly ['get' | 'post' | 'patch' | 'delete', string, object?],
    expected: number,
    authorization?: string,
  ) {
    const [method, path, body] = route;
    const call = api[method](path).timeout({
      response: 3_000,
      deadline: 5_000,
    });
    if (authorization) call.set('Authorization', authorization);
    if (body) call.send(body);
    const response = await call.expect(expected);
    expect(response.body).toMatchObject({ statusCode: expected });
    const message: unknown = response.body.message;
    expect(
      typeof message === 'string' ||
        (Array.isArray(message) &&
          message.every((part) => typeof part === 'string')),
    ).toBe(true);
    return response.body as {
      statusCode: number;
      message: string | string[];
      error?: string;
    };
  }

  await Promise.all(
    [...protectedRoutes, ...adminRoutes].flatMap((route) => [
      expectError(route, 401),
      expectError(route, 401, 'Bearer malformed-token'),
    ]),
  );
  await Promise.all(
    adminRoutes.map((route) => expectError(route, 403, ownerAuth)),
  );
  await api
    .patch(productUrl)
    .set('Authorization', adminAuth)
    .send({ price: 13 })
    .expect(200);
  await api
    .patch(`${orderUrl}/status`)
    .set('Authorization', adminAuth)
    .send({ status: 'PENDING' })
    .expect(200);

  const validationErrors = await Promise.all([
    expectError(['post', '/auth/register', { email: 'invalid' }], 400),
    expectError(
      ['post', '/product', { ...productDetails, price: -1 }],
      400,
      adminAuth,
    ),
    expectError(
      ['post', '/cart/items', { ...item, quantity: 0 }],
      400,
      otherAuth,
    ),
    expectError(['post', '/orders', { shippingAddress: 'x' }], 400, ownerAuth),
  ]);
  for (const error of validationErrors) {
    expect(error).toMatchObject({ error: 'Bad Request' });
    expect(error.message.length).toBeGreaterThan(0);
  }

  const paymentCancelled = await api.get('/orders/payment/cancel').expect(200);
  expect(paymentCancelled.body.message).toContain('Payment was cancelled');
  await expectError(['get', '/orders/payment/return'], 400);
  await expectError(
    ['get', '/orders/payment/return?token=unknown-payment'],
    404,
  );

  await Promise.all([
    expectError(['get', orderUrl], 404, otherAuth),
    expectError(['patch', `${orderUrl}/cancel`], 404, otherAuth),
    expectError(['post', `${orderUrl}/pay`], 404, otherAuth),
    expectError(['post', `${orderUrl}/capture`], 404, otherAuth),
  ]);
  expect(
    (await api.get('/orders').set('Authorization', otherAuth).expect(200)).body,
  ).toEqual([]);
  expect(
    (await api.get('/orders').set('Authorization', ownerAuth).expect(200)).body,
  ).toEqual([expect.objectContaining({ id: order.id })]);
  expect(
    (await api.get(orderUrl).set('Authorization', ownerAuth).expect(200)).body,
  ).toMatchObject({ id: order.id, status: 'PENDING' });

  await api.delete(productUrl).set('Authorization', adminAuth).expect(200);
  await expectError(['get', productUrl], 404);
  await api.post('/auth/logout').set('Authorization', otherAuth).expect(201);
  await expectError(['get', '/users/me'], 401, otherAuth);
});
