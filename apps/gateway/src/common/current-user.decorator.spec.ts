import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '@app/domains';
import { CurrentUserId } from './current-user.decorator';

type ParamFactory = (data: unknown, ctx: ExecutionContext) => string;

function getCurrentUserIdFactory(): ParamFactory {
  class Probe {
    handler(@CurrentUserId() _userId: string) {
      void _userId;
    }
  }

  const args = Reflect.getMetadata(
    '__routeArguments__',
    Probe,
    'handler',
  ) as Record<string, { factory: ParamFactory }>;
  return args[Object.keys(args)[0]].factory;
}

function contextWithUser(user: JwtPayload): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('CurrentUserId decorator', () => {
  const factory = getCurrentUserIdFactory();

  it('returns the sub claim of the authenticated user', () => {
    const ctx = contextWithUser({ sub: 'user-1', email: 'a@example.com' });

    expect(factory(undefined, ctx)).toBe('user-1');
  });
});
