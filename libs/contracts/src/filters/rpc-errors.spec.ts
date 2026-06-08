import { HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import type { ValidationError } from 'class-validator';
import { RpcErrors, rpcValidationExceptionFactory } from './rpc-errors';
import type { RpcErrorPayload } from './rpc-exception.filter';

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

describe('rpcValidationExceptionFactory', () => {
  it('flattens the constraints of every validation error into the message array', () => {
    const errors = [
      {
        property: 'email',
        constraints: { isEmail: 'email must be an email' },
      },
      {
        property: 'password',
        constraints: {
          isString: 'password must be a string',
          minLength: 'password is too short',
        },
      },
    ] as ValidationError[];

    expect(payloadOf(rpcValidationExceptionFactory(errors))).toEqual({
      statusCode: HttpStatus.BAD_REQUEST,
      message: [
        'email must be an email',
        'password must be a string',
        'password is too short',
      ],
      error: 'Bad Request',
    });
  });

  it('ignores errors without constraints', () => {
    const errors = [
      { property: 'nested' },
      {
        property: 'name',
        constraints: { isNotEmpty: 'name should not be empty' },
      },
    ] as ValidationError[];

    expect(payloadOf(rpcValidationExceptionFactory(errors))).toEqual({
      statusCode: HttpStatus.BAD_REQUEST,
      message: ['name should not be empty'],
      error: 'Bad Request',
    });
  });

  it('falls back to a generic message when no constraints are present', () => {
    expect(payloadOf(rpcValidationExceptionFactory([]))).toEqual({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Validation failed',
      error: 'Bad Request',
    });
  });
});
