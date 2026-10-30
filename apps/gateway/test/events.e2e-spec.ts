import { Kafka } from 'kafkajs';
import { ClientKafka, Transport } from '@nestjs/microservices';
import { CartEventsPublisher } from '../../cart/src/cart-events.publisher.js';
import { SERVICE_NAMES } from '@app/config';
import { ORDER_EVENTS, OrderStatus, UserRole } from '@app/domains';
import {
  StandardSchemaSerializerInterceptor,
  VersioningType,
  type INestApplication,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { firstValueFrom, of } from 'rxjs';

import { GatewayModule } from '../src/gateway.module.js';
import { EventsController } from '../src/events/events.controller.js';

describe('SSE HTTP integration', () => {
  let app: INestApplication;
  let base: string;
  beforeAll(async () => {
    const builder = Test.createTestingModule({ imports: [GatewayModule] });
    for (const name of Object.values(SERVICE_NAMES))
      builder
        .overrideProvider(name)
        .useValue({ send: vi.fn(() => of({ success: true })), emit: vi.fn() });
    const module = await builder.compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalInterceptors(
      new StandardSchemaSerializerInterceptor(app.get(Reflector)),
    );
    if (process.env.SSE_KAFKA_SMOKE === '1') {
      const admin = new Kafka({
        brokers: ['localhost:9094'],
        clientId: 'sse-smoke-admin',
      }).admin();
      await admin.connect();
      try {
        await admin.createTopics({
          waitForLeaders: true,
          topics: [...Object.values(ORDER_EVENTS), 'cart.updated'].map(
            (topic) => ({ topic, numPartitions: 1, replicationFactor: 1 }),
          ),
        });
      } finally {
        await admin.disconnect();
      }

      app.connectMicroservice({
        transport: Transport.KAFKA,
        options: {
          client: { clientId: 'sse-smoke', brokers: ['localhost:9094'] },
          consumer: {
            groupId: `sse-smoke-${Date.now()}`,
            allowAutoTopicCreation: true,
          },
        },
      });
      await app.startAllMicroservices();
    }
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  }, 30000);
  afterAll(async () => {
    await app.close();
  });
  it('rejects unauthenticated subscriptions', async () => {
    const response = await fetch(`${base}/api/v1/events`);
    expect(response.status).toBe(401);
  });
  it('ends the active HTTP stream immediately after logout succeeds', async () => {
    const abort = new AbortController();
    const token = new JwtService({ secret: process.env.JWT_SECRET }).sign(
      {
        sub: 'alice',
        sid: 'logout-session',
        role: UserRole.REGULAR,
        email: 'a@example.com',
      },
      { expiresIn: '1m' },
    );
    const headers = { Authorization: `Bearer ${token}` };
    const response = await fetch(`${base}/api/v1/events`, {
      headers,
      signal: abort.signal,
    });
    const reader = response.body!.getReader();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const ready = await reader.read();
      expect(new TextDecoder().decode(ready.value)).toContain('event: ready');
      const logout = await fetch(`${base}/api/v1/auth/logout`, {
        method: 'POST',
        headers,
      });
      expect(logout.status).toBe(201);
      const ended = await Promise.race([
        (async () => {
          while (!(await reader.read()).done) {
            /* drain */
          }
          return true;
        })(),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), 300);
        }),
      ]);
      expect(ended).toBe(true);
    } finally {
      clearTimeout(timer);
      abort.abort();
      await reader.cancel().catch(() => {});
    }
  });
  it('frames ready and order notifications and discards malformed Kafka payloads', async () => {
    const controller = new AbortController();
    const token = new JwtService({ secret: process.env.JWT_SECRET }).sign(
      {
        sub: 'alice',
        sid: 's',
        role: UserRole.REGULAR,
        email: 'a@example.com',
      },
      { expiresIn: '1m' },
    );
    const response = await fetch(`${base}/api/v1/events`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let frames = '';
    const readUntil = async (text: string) => {
      while (!frames.includes(text)) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error('Unexpected end of SSE stream');
        frames += decoder.decode(chunk.value, { stream: true });
      }
    };
    try {
      await readUntil('event: ready');
      const events = app.get(EventsController);
      events.paid({ invalid: true });
      events.paid({
        userId: 'bob',
        orderId: 'private',
        status: OrderStatus.PAID,
      });
      events.paid({
        userId: 'alice',
        orderId: 'o-1',
        status: OrderStatus.PAID,
      });
      await readUntil('data: {"orderId":"o-1"}');
      expect(frames).toContain(`event: ${ORDER_EVENTS.PAID}`);
      expect(frames).not.toContain('private');
      expect(frames).not.toContain('userId');
    } finally {
      controller.abort();
      await reader.cancel().catch(() => {});
    }
  });
  it.skipIf(process.env.SSE_KAFKA_SMOKE !== '1')(
    'delivers real Kafka order and cart events over HTTP',
    async () => {
      const kafka = new ClientKafka({
        client: { clientId: 'sse-smoke-producer', brokers: ['localhost:9094'] },
        producerOnlyMode: true,
      });
      const publisher = new CartEventsPublisher(kafka);
      const abort = new AbortController();
      await publisher.onModuleInit();
      try {
        const token = new JwtService({ secret: process.env.JWT_SECRET }).sign(
          {
            sub: 'alice',
            sid: 's',
            role: UserRole.REGULAR,
            email: 'a@example.com',
          },
          { expiresIn: '1m' },
        );
        const response = await fetch(`${base}/api/v1/events`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abort.signal,
        });
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let frames = '';
        const readUntil = async (text: string) => {
          while (!frames.includes(text)) {
            const chunk = await reader.read();
            if (chunk.done) throw new Error('Stream closed');
            frames += decoder.decode(chunk.value);
          }
        };
        await readUntil('event: ready');
        await firstValueFrom(
          kafka.emit(ORDER_EVENTS.CREATED, {
            key: 'smoke-order',
            value: {
              userId: 'alice',
              orderId: 'smoke-order',
              total: 0,
              items: [],
            },
          }),
        );
        publisher.updated('alice');
        await firstValueFrom(
          kafka.emit(ORDER_EVENTS.PAID, {
            key: 'smoke-order',
            value: {
              userId: 'alice',
              orderId: 'smoke-order',
              status: OrderStatus.PAID,
            },
          }),
        );
        await firstValueFrom(
          kafka.emit(ORDER_EVENTS.STATUS_CHANGED, {
            key: 'smoke-order',
            value: {
              userId: 'alice',
              orderId: 'smoke-order',
              status: OrderStatus.SHIPPED,
            },
          }),
        );
        await readUntil('event: order.created');
        await readUntil('event: cart.updated');
        await readUntil('event: order.paid');
        await readUntil('event: order.status-changed');
        abort.abort();
        await reader.cancel().catch(() => {});
      } finally {
        abort.abort();
        await publisher.onApplicationShutdown();
      }
    },
    30000,
  );
});
