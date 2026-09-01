import { HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

import { RpcErrors, rpcStandardSchemaExceptionFactory } from './rpc-errors.js';
import type { RpcErrorPayload } from './rpc-exception.filter.js';

function payloadOf(exception: RpcException): RpcErrorPayload {
  return exception.getError() as RpcErrorPayload;
}

describe('RpcErrors', () => {
  it('builds a Bad Request exception', () => {
    const exception = RpcErrors.badRequest('invalid input');

    expect(exception).toBeInstanceOf(RpcException);
    expect(payloadOf(exception)).toEqual({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'invalid input',
      error: 'Bad Request',
    });
  });

  it('builds an Unauthorized exception', () => {
    expect(payloadOf(RpcErrors.unauthorized('no token'))).toEqual({
      statusCode: HttpStatus.UNAUTHORIZED,
      message: 'no token',
      error: 'Unauthorized',
    });
  });

  it('builds a Not Found exception', () => {
    expect(payloadOf(RpcErrors.notFound('missing'))).toEqual({
      statusCode: HttpStatus.NOT_FOUND,
      message: 'missing',
      error: 'Not Found',
    });
  });

  it('builds a Conflict exception', () => {
    expect(payloadOf(RpcErrors.conflict('already exists'))).toEqual({
      statusCode: HttpStatus.CONFLICT,
      message: 'already exists',
      error: 'Conflict',
    });
  });
});

describe('rpcStandardSchemaExceptionFactory', () => {
  it('formats issue paths into the message array', () => {
    const issues = [
      {
        path: ['email'],
        message: 'Invalid email address',
      },
      {
        path: ['user', { key: 'password' }],
        message: 'Too small',
      },
    ];

    expect(payloadOf(rpcStandardSchemaExceptionFactory(issues))).toEqual({
      statusCode: HttpStatus.BAD_REQUEST,
      message: ['email: Invalid email address', 'user.password: Too small'],
      error: 'Bad Request',
    });
  });

  it('keeps messages for issues without a path', () => {
    expect(
      payloadOf(
        rpcStandardSchemaExceptionFactory([{ message: 'Validation failed' }]),
      ),
    ).toEqual({
      statusCode: HttpStatus.BAD_REQUEST,
      message: ['Validation failed'],
      error: 'Bad Request',
    });
  });

  it('falls back to a generic message when no issues are present', () => {
    expect(payloadOf(rpcStandardSchemaExceptionFactory([]))).toEqual({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Validation failed',
      error: 'Bad Request',
    });
  });
});
