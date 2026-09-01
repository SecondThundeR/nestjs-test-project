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

import { OrdersModule } from './orders.module.js';

async function bootstrap() {
  const { ports } = servicesConfig();
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    OrdersModule,
    {
      transport: Transport.TCP,
      options: { host: '0.0.0.0', port: ports.orders },
      logger: createWinstonLogger('Orders'),
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
    `Orders microservice is listening on TCP port ${ports.orders}`,
    'Orders',
  );
}

void bootstrap();
