import {
  HttpStatus,
  type StandardSchemaValidationPipeOptions,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

import type { RpcErrorPayload } from './rpc-exception.filter.js';

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

type StandardSchemaIssues = Parameters<
  NonNullable<StandardSchemaValidationPipeOptions['exceptionFactory']>
>[0];

export function rpcStandardSchemaExceptionFactory(
  issues: StandardSchemaIssues,
): RpcException {
  const messages = issues.map((issue) => {
    const path = issue.path
      ?.map((segment) =>
        typeof segment === 'object' && segment !== null
          ? String(segment.key)
          : String(segment),
      )
      .join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return rpcException(
    HttpStatus.BAD_REQUEST,
    'Bad Request',
    messages.length > 0 ? messages : 'Validation failed',
  );
}
