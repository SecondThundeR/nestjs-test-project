import { HttpException, HttpStatus } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { type Observable, of, throwError } from 'rxjs';

import { rpcSend } from './rpc.util';

function makeClient(observable: Observable<unknown>) {
  const send = jest.fn().mockReturnValue(observable);
  const client = { send } as unknown as ClientProxy;
  return { client, send };
}

describe('rpcSend', () => {
  it('resolves with the value emitted by the client', async () => {
    const result = { id: 'p-1' };
    const { client, send } = makeClient(of(result));

    await expect(rpcSend(client, 'pattern', { a: 1 })).resolves.toBe(result);
    expect(send).toHaveBeenCalledWith('pattern', { a: 1 });
  });

  it('maps an RPC error payload to a matching HttpException', async () => {
    const { client } = makeClient(
      throwError(() => ({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Product missing',
        error: 'Not Found',
      })),
    );

    const error = (await rpcSend(client, 'pattern', null).catch(
      (e: unknown) => e,
    )) as HttpException;

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(error.getResponse()).toEqual({
      statusCode: HttpStatus.NOT_FOUND,
      message: 'Product missing',
      error: 'Not Found',
    });
  });

  it('falls back to a 500 Internal Server Error for an unstructured error', async () => {
    const { client } = makeClient(throwError(() => 'boom'));

    const error = (await rpcSend(client, 'pattern', null).catch(
      (e: unknown) => e,
    )) as HttpException;

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(error.getResponse()).toEqual({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Error',
    });
  });
});
