import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { expect, it } from 'vitest';

async function prepareCheckout() {
  const url = process.env.E2E_API_URL;
  if (!url) throw new Error('Start the E2E stack with pnpm run test:e2e');
  const api = request(url);
  const admin = await api
    .post('/auth/login')
    .send({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    })
    .expect(201);
  const buyer = await api
    .post('/auth/register')
    .send({
      email: `buyer-${randomUUID()}@example.test`,
      name: 'E2E Buyer',
      password: randomUUID(),
    })
    .expect(201);
  const buyerAuth = `Bearer ${buyer.body.accessToken}`;
  const product = await api
    .post('/product')
    .set('Authorization', `Bearer ${admin.body.accessToken}`)
    .send({ name: 'Last unit', price: 12.34, stock: 1 })
    .expect(201);
  const productUrl = `/product/${product.body.id}`;
  const readStock = async () =>
    (await api.get(productUrl).expect(200)).body.stock;
  expect(await readStock()).toBe(1);
  await api
    .post('/cart/items')
    .set('Authorization', buyerAuth)
    .send({ productId: product.body.id, quantity: 1 })
    .expect(201);
  return {
    api,
    buyerAuth,
    buyerId: buyer.body.user.id,
    productId: product.body.id as string,
    readStock,
  };
}

it('reserves the last unit and restores it exactly once when the buyer cancels twice', async () => {
  const { api, buyerAuth, buyerId, productId, readStock } =
    await prepareCheckout();
  const order = await api
    .post('/orders')
    .set('Authorization', buyerAuth)
    .send({ shippingAddress: 'E2E test address' })
    .expect(201);
  expect(order.body).toMatchObject({
    status: 'PENDING',
    userId: buyerId,
    items: [{ productId, quantity: 1 }],
  });
  expect(await readStock()).toBe(0);
  const orderUrl = `/orders/${order.body.id}`;
  const cancelled = { id: order.body.id, status: 'CANCELLED' };
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await api
      .patch(`${orderUrl}/cancel`)
      .set('Authorization', buyerAuth)
      .expect(200);
    expect(response.body).toMatchObject(cancelled);
    expect(await readStock()).toBe(1);
  }
  const persisted = await api
    .get(orderUrl)
    .set('Authorization', buyerAuth)
    .expect(200);
  expect(persisted.body).toMatchObject(cancelled);
});

it('returns HTTP 400 when stock runs out after the Orders precheck', async () => {
  const { api, buyerAuth, productId } = await prepareCheckout();
  const url = process.env.E2E_PRODUCTS_DB_URL;
  if (!url) throw new Error('Missing E2E Products database URL');
  const db = await new DataSource({ type: 'postgres', url }).initialize();
  const lock = db.createQueryRunner();
  try {
    await lock.startTransaction();
    // The precheck still sees stock 1 until this transaction commits.
    await lock.query('UPDATE products SET stock = 0 WHERE id = $1', [
      productId,
    ]);
    const [{ pid }] = await lock.manager.query<{ pid: number }[]>(
      'SELECT pg_backend_pid() AS pid',
    );
    const order = api
      .post('/orders')
      .set('Authorization', buyerAuth)
      .send({ shippingAddress: 'E2E test address' });

    async function finishCompetingPurchase() {
      try {
        await expect
          .poll(
            async () => {
              const [row] = await db.query<{ waiting: boolean }[]>(
                `
            SELECT EXISTS (SELECT FROM pg_stat_activity
              WHERE $1::int = ANY(pg_blocking_pids(pid))) AS waiting
          `,
                [pid],
              );
              return row.waiting;
            },
            { timeout: 3500 },
          )
          .toBe(true);
        await lock.commitTransaction();
      } finally {
        if (lock.isTransactionActive) await lock.rollbackTransaction();
      }
    }

    const [result, competing] = await Promise.allSettled([
      order,
      finishCompetingPurchase(),
    ]);
    if (competing.status === 'rejected') throw competing.reason;
    if (result.status === 'rejected') throw result.reason;
    expect(result.value.status).toBe(400);
    expect(result.value.body).toMatchObject({
      statusCode: 400,
      message: `Product ${productId} is unavailable or has insufficient stock`,
    });
  } finally {
    await lock.release();
    await db.destroy();
  }
});
