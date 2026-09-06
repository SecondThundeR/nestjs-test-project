import { type JwtPayload, UserRole } from '@app/domains';
import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import { RolesGuard } from './roles.guard.js';

function contextWithUser(user?: Partial<JwtPayload>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('resolves its reflector through Nest dependency injection', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RolesGuard],
    }).compile();

    try {
      const injectedGuard = moduleRef.get(RolesGuard);
      const injectedReflector = moduleRef.get(Reflector);
      vi.spyOn(injectedReflector, 'getAllAndOverride').mockReturnValue([
        UserRole.ADMIN,
      ]);

      expect(() =>
        injectedGuard.canActivate(contextWithUser({ role: UserRole.REGULAR })),
      ).toThrow(ForbiddenException);
      expect(
        injectedGuard.canActivate(contextWithUser({ role: UserRole.ADMIN })),
      ).toBe(true);
    } finally {
      await moduleRef.close();
    }
  });

  function requireRoles(...roles: UserRole[] | []) {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(
      roles.length ? roles : undefined,
    );
  }

  it('allows the request when no roles are required', () => {
    requireRoles();

    expect(guard.canActivate(contextWithUser({ role: UserRole.REGULAR }))).toBe(
      true,
    );
  });

  it('allows an unauthenticated request when the required roles array is empty', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);

    expect(guard.canActivate(contextWithUser())).toBe(true);
  });

  it('allows the request when the user has the required role', () => {
    requireRoles(UserRole.ADMIN);

    expect(guard.canActivate(contextWithUser({ role: UserRole.ADMIN }))).toBe(
      true,
    );
  });

  it('forbids the request when the user lacks the required role', () => {
    requireRoles(UserRole.ADMIN);

    expect(() =>
      guard.canActivate(contextWithUser({ role: UserRole.REGULAR })),
    ).toThrow(ForbiddenException);
  });

  it('forbids the request when there is no authenticated user', () => {
    requireRoles(UserRole.ADMIN);

    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
