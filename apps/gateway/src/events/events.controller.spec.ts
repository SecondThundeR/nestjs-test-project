import { Test } from '@nestjs/testing';
import { CART_EVENTS, ORDER_EVENTS, OrderStatus } from '@app/domains';

import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';

describe('EventsController Kafka routing', () => {
  const events = { publish: vi.fn() };
  let controller: EventsController;
  beforeEach(async () => {
    events.publish.mockClear();
    const module = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [{ provide: EventsService, useValue: events }],
    }).compile();
    controller = module.get(EventsController);
  });
  it.each([
    ['created', ORDER_EVENTS.CREATED, { total: 0, items: [] }],
    ['paid', ORDER_EVENTS.PAID, { status: OrderStatus.PAID }],
    ['cancelled', ORDER_EVENTS.CANCELLED, { status: OrderStatus.CANCELLED }],
    [
      'statusChanged',
      ORDER_EVENTS.STATUS_CHANGED,
      { status: OrderStatus.SHIPPED },
    ],
  ] as const)('routes %s as a minimal refresh hint', (handler, type, extra) => {
    controller[handler]({ userId: 'alice', orderId: 'o-1', ...extra });
    expect(events.publish).toHaveBeenCalledWith({
      userId: 'alice',
      type,
      data: { orderId: 'o-1' },
    });
    controller[handler]({ invalid: true });
    expect(events.publish).toHaveBeenCalledOnce();
  });
  it('validates and routes cart notifications', () => {
    controller.cartUpdated({ userId: 'alice' });
    expect(events.publish).toHaveBeenCalledWith({
      userId: 'alice',
      type: CART_EVENTS.UPDATED,
      data: {},
    });
    controller.cartUpdated({ userId: 1 });
    expect(events.publish).toHaveBeenCalledOnce();
  });
});
