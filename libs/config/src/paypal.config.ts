import { registerAs } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';

export const PAYPAL_SANDBOX_API_URL = 'https://api-m.sandbox.paypal.com';

export const paypalConfig = registerAs('paypal', () => {
  const gatewayUrl = `http://localhost:${process.env.GATEWAY_PORT ?? '3000'}/api`;

  return {
    apiUrl: process.env.PAYPAL_API_URL ?? PAYPAL_SANDBOX_API_URL,
    clientId: process.env.PAYPAL_CLIENT_ID ?? '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? '',
    currency: process.env.PAYPAL_CURRENCY ?? 'USD',
    returnUrl:
      process.env.PAYPAL_RETURN_URL ?? `${gatewayUrl}/orders/payment/return`,
    cancelUrl:
      process.env.PAYPAL_CANCEL_URL ?? `${gatewayUrl}/orders/payment/cancel`,
  };
});

export type PaypalConfig = ConfigType<typeof paypalConfig>;
