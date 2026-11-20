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
import { of } from 'rxjs';

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
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  }, 30000);
  afterAll(async () => {
    await app.close();
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
});
