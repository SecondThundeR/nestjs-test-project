import { registerAs } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';

export const PAYPAL_SANDBOX_API_URL = 'https://api-m.sandbox.paypal.com';

export const paypalConfig = registerAs('paypal', () => ({
  apiUrl: process.env.PAYPAL_API_URL ?? PAYPAL_SANDBOX_API_URL,
  clientId: process.env.PAYPAL_CLIENT_ID ?? '',
  clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? '',
  currency: process.env.PAYPAL_CURRENCY ?? 'USD',
}));

export type PaypalConfig = ConfigType<typeof paypalConfig>;
