import type { LoggerService } from '@nestjs/common';
import { utilities, WinstonModule } from 'nest-winston';
import * as winston from 'winston';

const LOG_LEVELS = [
  'error',
  'warn',
  'info',
  'http',
  'verbose',
  'debug',
  'silly',
] as const;

type LogLevel = (typeof LOG_LEVELS)[number];

function resolveLevel(): LogLevel {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  return LOG_LEVELS.includes(level as LogLevel) ? (level as LogLevel) : 'info';
}

export function createWinstonLogger(service: string): LoggerService {
  const useJson = process.env.LOG_FORMAT?.toLowerCase() === 'json';

  const format = useJson
    ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      )
    : winston.format.combine(
        winston.format.timestamp(),
        winston.format.ms(),
        utilities.format.nestLike(service, {
          colors: true,
          prettyPrint: true,
        }),
      );

  return WinstonModule.createLogger({
    level: resolveLevel(),
    defaultMeta: useJson ? { service } : undefined,
    transports: [new winston.transports.Console({ format })],
  });
}
