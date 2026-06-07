import { RpcErrorPayload } from '@app/contracts';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

export async function rpcSend<T>(
  client: ClientProxy,
  pattern: string,
  data: unknown,
): Promise<T> {
  try {
    return await firstValueFrom(client.send<T>(pattern, data));
  } catch (error) {
    throw toHttpException(error);
  }
}

function toHttpException(error: unknown): HttpException {
  const payload = error as Partial<RpcErrorPayload> | undefined;
  const status =
    typeof payload?.statusCode === 'number'
      ? payload.statusCode
      : HttpStatus.INTERNAL_SERVER_ERROR;
  const message = payload?.message ?? 'Internal server error';
  const errorName = payload?.error ?? 'Error';

  return new HttpException(
    { statusCode: status, message, error: errorName },
    status,
  );
}
