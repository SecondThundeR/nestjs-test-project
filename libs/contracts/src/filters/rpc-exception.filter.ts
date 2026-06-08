import {
  Catch,
  type RpcExceptionFilter,
  type ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { type Observable, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';

export interface RpcErrorPayload {
  statusCode: number;
  message: string | string[];
  error: string;
}

@Catch(RpcException)
export class GlobalRpcExceptionFilter implements RpcExceptionFilter<RpcException> {
  catch(exception: RpcException, _host: ArgumentsHost): Observable<any> {
    return throwError(() => this.toPayload(exception));
  }

  private toPayload(exception: unknown): RpcErrorPayload {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'object' && response !== null) {
        const body = response as Record<string, string>;
        return {
          statusCode: status,
          message: body.message ?? exception.message,
          error: body.error ?? exception.name,
        };
      }
    }

    if (exception instanceof RpcException) {
      const error = exception.getError();
      if (typeof error === 'object' && error !== null) {
        return error as RpcErrorPayload;
      }
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: String(error),
        error: 'Bad Request',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message:
        exception instanceof Error
          ? exception.message
          : 'Internal server error',
      error: 'Internal server error',
    };
  }
}
