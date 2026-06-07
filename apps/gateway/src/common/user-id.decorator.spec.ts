import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { UserId } from './user-id.decorator';

type ParamFactory = (data: unknown, ctx: ExecutionContext) => string;

function getUserIdFactory(): ParamFactory {
  class Probe {
    handler(@UserId() _userId: string) {
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

function contextWithHeader(value: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ header: (_: string) => value }),
    }),
  } as unknown as ExecutionContext;
}

describe('UserId decorator', () => {
  const factory = getUserIdFactory();

  it('returns the trimmed x-user-id header when present', () => {
    expect(factory(undefined, contextWithHeader('  user-1  '))).toBe('user-1');
  });

  it('falls back to "demo-user" when the header is missing', () => {
    expect(factory(undefined, contextWithHeader(undefined))).toBe('demo-user');
  });

  it('falls back to "demo-user" when the header is blank', () => {
    expect(factory(undefined, contextWithHeader('   '))).toBe('demo-user');
  });
});
