import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { PaypalService } from '../src/paypal/paypal.service.js';

it('creates a checkout order through the PayPal Sandbox API', async ({
  skip,
}) => {
  const clientId = process.env.PAYPAL_SANDBOX_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_SANDBOX_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.log(
      'PayPal Sandbox skipped: set PAYPAL_SANDBOX_CLIENT_ID and PAYPAL_SANDBOX_CLIENT_SECRET',
    );
    skip();
    return;
  }
  const paypal = new PaypalService({
    apiUrl: 'https://api-m.sandbox.paypal.com',
    clientId,
    clientSecret,
    currency: 'USD',
    returnUrl: 'https://example.com/paypal/return',
    cancelUrl: 'https://example.com/paypal/cancel',
  });

  const order = await paypal.createOrder(randomUUID(), 1);
  expect(order.id).toBeTruthy();
  expect(['CREATED', 'PAYER_ACTION_REQUIRED']).toContain(order.status);
  expect(order.approveUrl).toBeTruthy();
  expect(new URL(order.approveUrl!).hostname).toBe('www.sandbox.paypal.com');
});
