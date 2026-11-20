import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { expect, it, onTestFinished } from 'vitest';

async function connectEvents(url: string, name: string, authorization: string) {
  const abort = new AbortController();
  let reading: Promise<void> | undefined;
  const connectionTimeout = setTimeout(
    () => abort.abort(new Error(`${name}: timed out opening SSE stream`)),
    5_000,
  );
  onTestFinished(async () => {
    abort.abort();
    await reading;
  });
  const response = await fetch(`${url}/events`, {
    headers: { Authorization: authorization },
    signal: abort.signal,
  }).finally(() => clearTimeout(connectionTimeout));
  expect(response.status, `${name}: SSE response`).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  if (!response.body) throw new Error(`${name}: missing SSE body`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: { type: string; data: string | undefined }[] = [];
  let closed = false;
  let streamError: unknown;
  reading = (async () => {
    let buffer = '';
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          closed = true;
          return;
        }
        buffer += decoder.decode(chunk.value, { stream: true });
        let boundary = /\r?\n\r?\n/.exec(buffer);
        while (boundary) {
          const frame = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);
          const type = /^event: ?(.+)$/m.exec(frame)?.[1]?.trim();
          if (type)
            events.push({
              type,
              data: /^data: ?(.+)$/m.exec(frame)?.[1]?.trim(),
            });
          boundary = /\r?\n\r?\n/.exec(buffer);
        }
      }
    } catch (error) {
      streamError = error;
    } finally {
      reader.releaseLock();
    }
  })();

  const count = (type: string) =>
    events.filter((event) => event.type === type).length;
  return {
    count,
    async waitFor(type: string, times = 1, timeout = 5_000) {
      await expect
        .poll(() => count(type), {
          timeout,
          message: `${name}: expected ${type} event #${times}`,
        })
        .toBeGreaterThanOrEqual(times);
      expect(streamError).toBeUndefined();
    },
    async waitForOrder(type: string, orderId: string) {
      await expect
        .poll(() => events.find((event) => event.type === type)?.data, {
          timeout: 5_000,
          message: `${name}: expected ${type} for order ${orderId}`,
        })
        .toBe(JSON.stringify({ orderId }));
    },
    async waitForEnd() {
      await expect
        .poll(() => closed, {
          timeout: 4_000,
          message: `${name}: expected SSE stream to end after logout`,
        })
        .toBe(true);
      expect(streamError).toBeUndefined();
    },
  };
}

it('routes cart updates to the owner and closes only the logged-out session', async () => {
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
  const { body: product } = await api
    .post('/product')
    .set('Authorization', `Bearer ${admin.body.accessToken}`)
    .send({ name: 'SSE product', price: 10, stock: 5 })
    .expect(201);

  const owner = {
    email: `owner-${randomUUID()}@example.test`,
    password: randomUUID(),
  };
  const other = {
    email: `other-${randomUUID()}@example.test`,
    password: randomUUID(),
  };
  const { body: ownerRegistration } = await api
    .post('/auth/register')
    .send({ ...owner, name: 'Cart owner' })
    .expect(201);
  const { body: secondLogin } = await api
    .post('/auth/login')
    .send(owner)
    .expect(201);
  const { body: otherRegistration } = await api
    .post('/auth/register')
    .send({ ...other, name: 'Other buyer' })
    .expect(201);
  const firstAuth = `Bearer ${ownerRegistration.accessToken}`;
  const secondAuth = `Bearer ${secondLogin.accessToken}`;
  const otherAuth = `Bearer ${otherRegistration.accessToken}`;
  const [firstStream, secondStream, otherStream] = await Promise.all([
    connectEvents(url, 'owner first session', firstAuth),
    connectEvents(url, 'owner second session', secondAuth),
    connectEvents(url, 'other buyer', otherAuth),
  ]);
  await Promise.all(
    [firstStream, secondStream, otherStream].map((stream) =>
      stream.waitFor('ready'),
    ),
  );

  const addProduct = (authorization: string) =>
    api
      .post('/cart/items')
      .set('Authorization', authorization)
      .send({ productId: product.id, quantity: 1 })
      .expect(201);

  await addProduct(firstAuth);
  await Promise.all([
    firstStream.waitFor('cart.updated'),
    secondStream.waitFor('cart.updated'),
  ]);

  // A subsequent heartbeat demonstrates the other stream was alive after the owner's update.
  await otherStream.waitFor(
    'heartbeat',
    otherStream.count('heartbeat') + 1,
    19_000,
  );
  expect(
    otherStream.count('cart.updated'),
    "other buyer received the owner's update",
  ).toBe(0);
  await addProduct(otherAuth);
  await otherStream.waitFor('cart.updated');
  expect(otherStream.count('cart.updated')).toBe(1);

  await api.post('/auth/logout').set('Authorization', firstAuth).expect(201);
  await firstStream.waitForEnd();
  expect(secondStream.count('cart.updated')).toBe(1);
  await addProduct(secondAuth);
  await secondStream.waitFor('cart.updated', 2);
  expect(firstStream.count('cart.updated')).toBe(1);
  expect(otherStream.count('cart.updated')).toBe(1);
});

it('delivers order lifecycle events from Kafka to the buyer over SSE', async () => {
  const url = process.env.E2E_API_URL;
  const gateway = process.env.E2E_GATEWAY_CONTAINER;
  if (!url || !gateway)
    throw new Error('Start the E2E stack with pnpm run test:e2e');
  const { body } = await request(url)
    .post('/auth/register')
    .send({
      email: `order-events-${randomUUID()}@example.test`,
      name: 'Order buyer',
      password: randomUUID(),
    })
    .expect(201);
  const stream = await connectEvents(
    url,
    'order buyer',
    `Bearer ${body.accessToken}`,
  );
  await stream.waitFor('ready');

  const orderId = randomUUID();
  expect(body.user.id).toEqual(expect.any(String));
  const base = { userId: body.user.id, orderId };
  const events = [
    { topic: 'order.created', value: { ...base, total: 0, items: [] } },
    { topic: 'order.paid', value: { ...base, status: 'PAID' } },
    { topic: 'order.status-changed', value: { ...base, status: 'SHIPPED' } },
    { topic: 'order.cancelled', value: { ...base, status: 'CANCELLED' } },
  ];

  // Run the producer inside the Compose network so Kafka stays unexposed.
  await promisify(execFile)(
    'docker',
    [
      'exec',
      gateway,
      'node',
      '--input-type=module',
      '-e',
      `
    import kafka from 'kafkajs';
    const producer = new kafka.Kafka({ brokers: process.env.KAFKA_BROKERS.split(',') }).producer();
    await producer.connect();
    try {
      for (const { topic, value } of JSON.parse(process.argv[1])) {
        await producer.send({ topic, messages: [{ key: value.orderId, value: JSON.stringify(value) }] });
      }
    } finally {
      await producer.disconnect();
    }
  `,
      JSON.stringify(events),
    ],
    { timeout: 10_000 },
  );
  await Promise.all(
    events.map(({ topic }) => stream.waitForOrder(topic, orderId)),
  );
});
