import type { RpcErrorPayload } from '@app/filters';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

const logger = new Logger('RpcSend');

export async function rpcSend<T>(
  client: ClientProxy,
  pattern: string,
  data: unknown,
): Promise<T> {
  try {
    return await firstValueFrom(client.send<T>(pattern, data));
  } catch (error) {
    const httpException = toHttpException(error);
    const status = httpException.getStatus();
    const message = `"${pattern}" failed with ${status}: ${httpException.message}`;
    if (status >= 500) {
      logger.error(message);
    } else {
      logger.debug(message);
    }
    throw httpException;
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
