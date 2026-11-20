import { describe, expect, it } from 'vitest';
import {
  addCartItemSchema,
  createOrderSchema,
  createProductSchema,
  createUserSchema,
  refreshTokenSchema,
  updateCartItemSchema,
  updateOrderStatusSchema,
  updateProductSchema,
  validateUserByCredentialsSchema,
} from './index.js';

describe('HTTP request schemas', () => {
  it.each([
    { name: 'x' },
    { name: null },
    { name: 1 },
    { price: -1 },
    { price: 1.001 },
    { price: '10' },
    { price: null },
    { stock: -1 },
    { stock: 1.5 },
    { stock: '2' },
    { description: 1 },
    { extra: true },
  ])('rejects invalid product fields %j on create and update', (fields) => {
    const product = { name: 'Widget', price: 10 };
    expect(
      createProductSchema.safeParse({ ...product, ...fields }).success,
    ).toBe(false);
    expect(updateProductSchema.safeParse(fields).success).toBe(false);
  });

  it('accepts zero price, optional product fields and an empty patch', () => {
    expect(createProductSchema.parse({ name: 'Widget', price: 0 })).toEqual({
      name: 'Widget',
      price: 0,
    });
    expect(updateProductSchema.parse({})).toEqual({});
  });

  const user = {
    name: 'Buyer',
    email: 'buyer@example.test',
    password: 'fixture-password',
  };
  const login = { email: user.email, password: user.password };
  it.each([
    ['invalid registration email', createUserSchema, { ...user, email: 'bad' }],
    ['short name', createUserSchema, { ...user, name: 'x' }],
    ['short password', createUserSchema, { ...user, password: '1234567' }],
    ['missing registration fields', createUserSchema, {}],
    ['injected role', createUserSchema, { ...user, role: 'admin' }],
    ['unknown registration field', createUserSchema, { ...user, extra: true }],
    [
      'invalid login email',
      validateUserByCredentialsSchema,
      { ...login, email: 'bad' },
    ],
    [
      'empty login password',
      validateUserByCredentialsSchema,
      { ...login, password: '' },
    ],
    [
      'unknown login field',
      validateUserByCredentialsSchema,
      { ...login, extra: 1 },
    ],
    ['empty refresh token', refreshTokenSchema, { refreshToken: '' }],
    ['missing refresh token', refreshTokenSchema, {}],
    [
      'unknown refresh field',
      refreshTokenSchema,
      { refreshToken: 'x', extra: 1 },
    ],
    ['empty product ID', addCartItemSchema, { productId: '', quantity: 1 }],
    ['zero add quantity', addCartItemSchema, { productId: 'p-1', quantity: 0 }],
    ['missing address', createOrderSchema, {}],
    ['short address', createOrderSchema, { shippingAddress: 'abc' }],
    ['numeric address', createOrderSchema, { shippingAddress: 123 }],
    [
      'injected owner',
      createOrderSchema,
      { shippingAddress: 'Valid address', userId: 'other' },
    ],
    ['unknown order status', updateOrderStatusSchema, { status: 'INVALID' }],
  ] as const)('rejects %s', (_name, schema, input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });

  it.each([-1, 1.5, '2'])(
    'rejects quantity %j on cart add and update',
    (quantity) => {
      expect(
        addCartItemSchema.safeParse({ productId: 'p-1', quantity }).success,
      ).toBe(false);
      expect(updateCartItemSchema.safeParse({ quantity }).success).toBe(false);
    },
  );

  it('accepts zero as a cart update quantity', () => {
    expect(updateCartItemSchema.parse({ quantity: 0 })).toEqual({
      quantity: 0,
    });
  });
});
