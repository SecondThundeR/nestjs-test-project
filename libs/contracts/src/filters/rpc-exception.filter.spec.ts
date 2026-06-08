import { firstValueFrom } from 'rxjs';
import {
  HttpException,
  HttpStatus,
  NotFoundException,
  type ArgumentsHost,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import {
  GlobalRpcExceptionFilter,
  type RpcErrorPayload,
} from './rpc-exception.filter';

describe('GlobalRpcExceptionFilter', () => {
  let filter: GlobalRpcExceptionFilter;
  const host = {} as ArgumentsHost;

  beforeEach(() => {
    filter = new GlobalRpcExceptionFilter();
  });

  async function caught(exception: RpcException): Promise<unknown> {
    return firstValueFrom(filter.catch(exception, host)).catch(
      (e: unknown) => e,
    );
  }

  function toPayload(exception: unknown): RpcErrorPayload {
    return (
      filter as unknown as {
        toPayload(exception: unknown): RpcErrorPayload;
      }
    ).toPayload(exception);
  }

  describe('catch', () => {
    it('re-emits a structured RpcException error payload unchanged', async () => {
      const payload: RpcErrorPayload = {
        statusCode: 404,
        message: 'Product missing not found',
        error: 'Not Found',
      };

      await expect(caught(new RpcException(payload))).resolves.toEqual(payload);
    });

    it('wraps a string RpcException error into a Bad Request payload', async () => {
      await expect(caught(new RpcException('boom'))).resolves.toEqual({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'boom',
        error: 'Bad Request',
      });
    });

    it('returns an observable that errors rather than completing', () => {
      const next = jest.fn();
      const error = jest.fn();
      const complete = jest.fn();

      filter
        .catch(new RpcException('boom'), host)
        .subscribe({ next, error, complete });

      expect(error).toHaveBeenCalledWith({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'boom',
        error: 'Bad Request',
      });
      expect(next).not.toHaveBeenCalled();
      expect(complete).not.toHaveBeenCalled();
    });
  });

  describe('toPayload', () => {
    it('maps an HttpException with an object response onto the payload fields', () => {
      const exception = new NotFoundException('Product missing not found');

      expect(toPayload(exception)).toEqual({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Product missing not found',
        error: 'Not Found',
      });
    });

    it('falls back to the exception message and name for a sparse object response', () => {
      const exception = new HttpException({ foo: 'bar' }, HttpStatus.FORBIDDEN);

      expect(toPayload(exception)).toEqual({
        statusCode: HttpStatus.FORBIDDEN,
        message: exception.message,
        error: exception.name,
      });
    });

    it('treats an HttpException with a string response as a generic error', () => {
      const exception = new HttpException('plain text', HttpStatus.BAD_GATEWAY);

      expect(toPayload(exception)).toEqual({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: exception.message,
        error: 'Internal server error',
      });
    });

    it('returns the raw error object of an RpcException unchanged', () => {
      const payload: RpcErrorPayload = {
        statusCode: 409,
        message: 'Conflict',
        error: 'Conflict',
      };

      expect(toPayload(new RpcException(payload))).toEqual(payload);
    });

    it('wraps a string RpcException error into a Bad Request payload', () => {
      expect(toPayload(new RpcException('nope'))).toEqual({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'nope',
        error: 'Bad Request',
      });
    });

    it('uses the message of a plain Error for the fallback payload', () => {
      expect(toPayload(new Error('kaboom'))).toEqual({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'kaboom',
        error: 'Internal server error',
      });
    });

    it('uses a generic message for a non-Error value', () => {
      expect(toPayload('just a string')).toEqual({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        error: 'Internal server error',
      });
    });
  });
});
