import { expect, it, vi } from 'vitest';
import { UsersController } from './users.controller.js';
import type { UsersService } from './users.service.js';

const credentials = {
  email: 'buyer@example.test',
  password: 'fixture-password',
};
const registration = { ...credentials, name: 'Buyer' };

it.each([
  ['create', 'create', registration],
  ['validateCredentials', 'findByCredentials', credentials],
  ['findById', 'findById', 'buyer'],
] as const)(
  'forwards %s to UsersService.%s',
  async (action, method, payload) => {
    const execute = vi.fn().mockResolvedValue('user result');
    const controller = new UsersController({
      [method]: execute,
    } as unknown as UsersService);
    const call = controller[action] as (
      value: typeof payload,
    ) => Promise<unknown>;
    await expect(call.call(controller, payload)).resolves.toBe('user result');
    expect(execute).toHaveBeenCalledExactlyOnceWith(payload);
  },
);
