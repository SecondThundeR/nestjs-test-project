import { expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';

const credentials = {
  email: 'buyer@example.test',
  password: 'fixture-password',
};
const registration = { ...credentials, name: 'Buyer' };
const refresh = { refreshToken: 'token' };

it.each([
  ['register', registration],
  ['login', credentials],
  ['verify', 'session'],
  ['refresh', refresh],
  ['logout', 'session'],
] as const)('forwards %s to AuthService', async (method, payload) => {
  const execute = vi.fn().mockResolvedValue('auth result');
  const controller = new AuthController({
    [method]: execute,
  } as unknown as AuthService);
  const call = controller[method] as (
    value: typeof payload,
  ) => Promise<unknown>;
  await expect(call.call(controller, payload)).resolves.toBe('auth result');
  expect(execute).toHaveBeenCalledExactlyOnceWith(payload);
});
