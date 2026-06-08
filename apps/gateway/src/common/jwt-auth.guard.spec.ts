import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JWT_CONFIG, type JwtPayload } from '@app/contracts';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const jwtService = new JwtService({ secret: JWT_CONFIG.secret });
  const guard = new JwtAuthGuard(jwtService);

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

  it('allows the request and attaches the payload for a valid token', () => {
    const token = jwtService.sign({ sub: 'alice', email: 'a@example.com' });
    const { ctx, request } = contextWithAuth(`Bearer ${token}`);

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.user).toMatchObject({
      sub: 'alice',
      email: 'a@example.com',
    });
  });

  it('throws when the Authorization header is missing', () => {
    const { ctx } = contextWithAuth(undefined);

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('throws when the scheme is not Bearer', () => {
    const token = jwtService.sign({ sub: 'alice', email: 'a@example.com' });
    const { ctx } = contextWithAuth(`Basic ${token}`);

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('throws when the token is invalid', () => {
    const { ctx } = contextWithAuth('Bearer not-a-token');

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
