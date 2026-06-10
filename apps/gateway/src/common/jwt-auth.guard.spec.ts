import {
  HttpException,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ClientProxy } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';
import { USERS_PATTERNS, type JwtPayload } from '@app/domains';
import { authConfig } from '@app/config';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const jwtService = new JwtService({ secret: authConfig().secret });
  let users: { send: jest.Mock };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    users = { send: jest.fn() };
    guard = new JwtAuthGuard(jwtService, users as unknown as ClientProxy);
  });

  function signToken(): string {
    return jwtService.sign({
      sub: 'alice',
      email: 'a@example.com',
      sid: 'session-1',
    });
  }

  function contextWithAuth(authorization: string | undefined): {
    ctx: ExecutionContext;
    request: { user?: JwtPayload };
  } {
    const request: { user?: JwtPayload; header: (name: string) => unknown } = {
      header: (name: string) =>
        name === 'authorization' ? authorization : undefined,
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { ctx, request };
  }

  it('allows the request and attaches the payload for an active session', async () => {
    const token = signToken();
    const { ctx, request } = contextWithAuth(`Bearer ${token}`);
    users.send.mockReturnValue(of({ id: 'alice' }));

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toMatchObject({
      sub: 'alice',
      email: 'a@example.com',
      sid: 'session-1',
    });
    expect(users.send).toHaveBeenCalledWith(USERS_PATTERNS.VERIFY, token);
  });

  it('throws when the Authorization header is missing', async () => {
    const { ctx } = contextWithAuth(undefined);

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(users.send).not.toHaveBeenCalled();
  });

  it('throws when the scheme is not Bearer', async () => {
    const { ctx } = contextWithAuth(`Basic ${signToken()}`);

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(users.send).not.toHaveBeenCalled();
  });

  it('throws when the token is invalid without calling the users service', async () => {
    const { ctx } = contextWithAuth('Bearer not-a-token');

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(users.send).not.toHaveBeenCalled();
  });

  it('throws 401 when the session has been revoked', async () => {
    const { ctx, request } = contextWithAuth(`Bearer ${signToken()}`);
    users.send.mockReturnValue(
      throwError(() => ({
        statusCode: 401,
        message: 'Invalid or expired token',
        error: 'Unauthorized',
      })),
    );

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      status: 401,
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);
    expect(request.user).toBeUndefined();
  });
});
