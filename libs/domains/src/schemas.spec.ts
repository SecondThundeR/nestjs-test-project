import {
  createOrderPayloadSchema,
  createProductSchema,
  createUserSchema,
  publicUserSchema,
  updateOrderStatusPayloadSchema,
  UserRole,
} from './index.js';

describe('domain schemas', () => {
  it('accepts a valid product and rejects unknown request properties', () => {
    expect(
      createProductSchema.parse({ name: 'Widget', price: 10, stock: 2 }),
    ).toEqual({ name: 'Widget', price: 10, stock: 2 });

    expect(() =>
      createProductSchema.parse({ name: 'Widget', price: 10, hacked: true }),
    ).toThrow(/Unrecognized key/);
  });

  it('enforces request constraints', () => {
    expect(
      createUserSchema.safeParse({
        email: 'not-an-email',
        name: 'x',
        password: 'short',
      }).success,
    ).toBe(false);
    expect(
      createOrderPayloadSchema.safeParse({
        userId: 'u-1',
        shippingAddress: 'x',
      }).success,
    ).toBe(false);
  });

  it('keeps internal payload contracts strict', () => {
    expect(
      updateOrderStatusPayloadSchema.safeParse({
        id: 'o-1',
        status: 'SHIPPED',
        userId: 'u-1',
      }).success,
    ).toBe(false);
  });

  it('strips sensitive and undeclared public-user fields', () => {
    const timestamp = '2026-06-15T10:00:00.000Z';
    expect(
      publicUserSchema.parse({
        id: 'u-1',
        email: 'user@example.com',
        name: 'User',
        role: UserRole.REGULAR,
        createdAt: timestamp,
        updatedAt: timestamp,
        passwordHash: 'secret',
        internalFlag: true,
      }),
    ).toEqual({
      id: 'u-1',
      email: 'user@example.com',
      name: 'User',
      role: UserRole.REGULAR,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });
});
