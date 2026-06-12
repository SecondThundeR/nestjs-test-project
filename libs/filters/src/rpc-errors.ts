import { HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import type { ValidationError } from 'class-validator';
import type { RpcErrorPayload } from './rpc-exception.filter';

function rpcException(
  statusCode: number,
  error: string,
  message: string | string[],
): RpcException {
  return new RpcException({
    statusCode,
    message,
    error,
  } satisfies RpcErrorPayload);
}

export const RpcErrors = {
  badRequest: (message: string) =>
    rpcException(HttpStatus.BAD_REQUEST, 'Bad Request', message),
  unauthorized: (message: string) =>
    rpcException(HttpStatus.UNAUTHORIZED, 'Unauthorized', message),
  notFound: (message: string) =>
    rpcException(HttpStatus.NOT_FOUND, 'Not Found', message),
  conflict: (message: string) =>
    rpcException(HttpStatus.CONFLICT, 'Conflict', message),
  badGateway: (message: string) =>
    rpcException(HttpStatus.BAD_GATEWAY, 'Bad Gateway', message),
};

export function rpcValidationExceptionFactory(
  errors: ValidationError[],
): RpcException {
  const messages = errors.flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
  return rpcException(
    HttpStatus.BAD_REQUEST,
    'Bad Request',
    messages.length > 0 ? messages : 'Validation failed',
  );
}
