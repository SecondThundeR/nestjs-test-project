import 'reflect-metadata';

import { type JwtPayload, UserRole } from '@app/domains';
import { ExecutionContext } from '@nestjs/common';

import { CurrentSessionId, CurrentUserId } from './current-user.decorator.js';

type ParamFactory = (data: unknown, ctx: ExecutionContext) => string;

function getDecoratorFactory(
  decorator: () => ParameterDecorator,
): ParamFactory {
  class Probe {
    handler(@decorator() _value: string) {
      void _value;
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

const USER: JwtPayload = {
  sub: 'user-1',
  email: 'a@example.com',
  sid: 'session-1',
  role: UserRole.REGULAR,
};

describe('CurrentUserId decorator', () => {
  const factory = getDecoratorFactory(CurrentUserId);

  it('returns the sub claim of the authenticated user', () => {
    expect(factory(undefined, contextWithUser(USER))).toBe('user-1');
  });
});

describe('CurrentSessionId decorator', () => {
  const factory = getDecoratorFactory(CurrentSessionId);

  it('returns the sid claim of the authenticated user', () => {
    expect(factory(undefined, contextWithUser(USER))).toBe('session-1');
  });
});
