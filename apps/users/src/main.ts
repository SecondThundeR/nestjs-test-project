import 'dotenv/config';

import { servicesConfig } from '@app/config';
import {
  GlobalRpcExceptionFilter,
  rpcStandardSchemaExceptionFactory,
} from '@app/filters';
import { createWinstonLogger } from '@app/logger';
import { Logger, StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';

import { UsersModule } from './users.module.js';

async function bootstrap() {
  const { ports } = servicesConfig();
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    UsersModule,
    {
      transport: Transport.TCP,
      options: { host: '0.0.0.0', port: ports.users },
      logger: createWinstonLogger('Users'),
    },
  );

  app.useGlobalPipes(
    new StandardSchemaValidationPipe({
      transform: true,
      exceptionFactory: rpcStandardSchemaExceptionFactory,
    }),
  );
  app.useGlobalFilters(new GlobalRpcExceptionFilter());

  app.enableShutdownHooks();

  await app.listen();
  Logger.log(
    `Users microservice is listening on TCP port ${ports.users}`,
    'Users',
  );
}

void bootstrap();
