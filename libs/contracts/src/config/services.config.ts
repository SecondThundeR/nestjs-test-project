export const SERVICE_NAMES = {
  PRODUCTS: 'PRODUCTS_SERVICE',
  CART: 'CART_SERVICE',
  ORDERS: 'ORDERS_SERVICE',
} as const;

export const SERVICE_PORTS = {
  GATEWAY: Number(process.env.GATEWAY_PORT ?? 3000),
  PRODUCTS: Number(process.env.PRODUCTS_PORT ?? 3001),
  CART: Number(process.env.CART_PORT ?? 3002),
  ORDERS: Number(process.env.ORDERS_PORT ?? 3003),
};

export const SERVICE_HOSTS = {
  PRODUCTS: process.env.PRODUCTS_HOST ?? '127.0.0.1',
  CART: process.env.CART_HOST ?? '127.0.0.1',
  ORDERS: process.env.ORDERS_HOST ?? '127.0.0.1',
};
