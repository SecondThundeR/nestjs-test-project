import { OrderStatus } from '@app/domains';
import { describe, expect, it } from 'vitest';

import { cancellationOperation } from './cancellation-operation.js';

describe('order cancellation', () => {
  it.each([
    [OrderStatus.PENDING, null, 'release'],
    [OrderStatus.PAID, 'capture-1', 'refund'],
    [OrderStatus.CANCELLED, 'previously-refunded', 'release'],
  ] as const)(
    'selects %s cancellation operation',
    (status, captureId, kind) => {
      expect(cancellationOperation({ status, captureId })).toBe(kind);
    },
  );

  it.each([
    [OrderStatus.PAID, 'Order has no capture to refund'],
    [OrderStatus.SHIPPED, 'Cannot cancel an order that has shipped'],
    [OrderStatus.DELIVERED, 'Cannot cancel an order that has shipped'],
  ] as const)('rejects cancellation for %s', (status, message) => {
    expect(() => cancellationOperation({ status, captureId: null })).toThrow(
      message,
    );
  });
});
