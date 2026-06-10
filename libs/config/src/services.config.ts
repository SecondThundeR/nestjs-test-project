import { registerAs } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';

export const SERVICE_NAMES = {
  PRODUCTS: 'PRODUCTS_SERVICE',
  CART: 'CART_SERVICE',
  ORDERS: 'ORDERS_SERVICE',
  USERS: 'USERS_SERVICE',
  AUTH: 'AUTH_SERVICE',
} as const;

export const servicesConfig = registerAs('services', () => ({
  ports: {
    gateway: Number(process.env.GATEWAY_PORT ?? 3000),
    products: Number(process.env.PRODUCTS_PORT ?? 3001),
    cart: Number(process.env.CART_PORT ?? 3002),
    orders: Number(process.env.ORDERS_PORT ?? 3003),
    users: Number(process.env.USERS_PORT ?? 3004),
    auth: Number(process.env.AUTH_PORT ?? 3005),
  },
  hosts: {
    products: process.env.PRODUCTS_HOST ?? '127.0.0.1',
    cart: process.env.CART_HOST ?? '127.0.0.1',
    orders: process.env.ORDERS_HOST ?? '127.0.0.1',
    users: process.env.USERS_HOST ?? '127.0.0.1',
    auth: process.env.AUTH_HOST ?? '127.0.0.1',
  },
}));

export type ServicesConfig = ConfigType<typeof servicesConfig>;
