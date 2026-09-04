import { SERVICE_NAMES } from '@app/config';
import {
  AUTH_PATTERNS,
  type CreateUserDto,
  type RefreshTokenDto,
  type ValidateUserByCredentialsDto,
} from '@app/domains';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';
import type { Mock } from 'vitest';

import { AuthGatewayController } from './auth.gateway.controller.js';

describe('AuthGatewayController', () => {
  let controller: AuthGatewayController;
  let auth: { send: Mock };

  beforeEach(async () => {
    auth = { send: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule.register({ session: false })],
      controllers: [AuthGatewayController],
      providers: [{ provide: SERVICE_NAMES.AUTH, useValue: auth }],
    }).compile();

    controller = moduleRef.get(AuthGatewayController);
  });

  it('forwards register() as a REGISTER message with the dto', async () => {
    const dto: CreateUserDto = {
      email: 'jane@example.com',
      name: 'Jane',
      password: 'password123',
    };
    const result = { user: { id: 'u-1' } };
    auth.send.mockReturnValue(of(result));

    await expect(controller.register(dto)).resolves.toBe(result);
    expect(auth.send).toHaveBeenCalledWith(AUTH_PATTERNS.REGISTER, dto);
  });

  it('forwards login() as a LOGIN message with the dto', async () => {
    const dto: ValidateUserByCredentialsDto = {
      email: 'jane@example.com',
      password: 'password123',
    };
    const result = { user: { id: 'u-1' } };
    auth.send.mockReturnValue(of(result));

    await expect(controller.login(dto)).resolves.toBe(result);
    expect(auth.send).toHaveBeenCalledWith(AUTH_PATTERNS.LOGIN, dto);
  });

  it('forwards refresh() as a REFRESH message with the dto', async () => {
    const dto: RefreshTokenDto = { refreshToken: 'refresh-token' };
    const result = { accessToken: 'a.b.c' };
    auth.send.mockReturnValue(of(result));

    await expect(controller.refresh(dto)).resolves.toBe(result);
    expect(auth.send).toHaveBeenCalledWith(AUTH_PATTERNS.REFRESH, dto);
  });

  it('forwards logout() as a LOGOUT message with the session id', async () => {
    const result = { success: true };
    auth.send.mockReturnValue(of(result));

    await expect(controller.logout('session-1')).resolves.toBe(result);
    expect(auth.send).toHaveBeenCalledWith(AUTH_PATTERNS.LOGOUT, 'session-1');
  });
});
