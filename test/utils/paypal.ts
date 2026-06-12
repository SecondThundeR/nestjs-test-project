import type {
  PaypalOrder,
  PaypalRefund,
} from '../../apps/orders/src/paypal/paypal.service';

export function makePaypalOrder(
  overrides: Partial<PaypalOrder> = {},
): PaypalOrder {
  return {
    id: 'pp-1',
    status: 'CREATED',
    approveUrl: 'https://paypal.test/approve',
    captureId: null,
    ...overrides,
  };
}

export function makePaypalCapture(
  overrides: Partial<PaypalOrder> = {},
): PaypalOrder {
  return makePaypalOrder({
    status: 'COMPLETED',
    approveUrl: null,
    captureId: 'cap-1',
    ...overrides,
  });
}

export function makePaypalRefund(
  overrides: Partial<PaypalRefund> = {},
): PaypalRefund {
  return { id: 'ref-1', status: 'COMPLETED', ...overrides };
}
