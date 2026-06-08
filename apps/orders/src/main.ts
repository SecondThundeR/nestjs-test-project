import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { OrdersModule } from './orders.module';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';
import { servicesConfig } from '@app/config';
import { createWinstonLogger } from '@app/logger';
import {
  GlobalRpcExceptionFilter,
  rpcValidationExceptionFactory,
} from '@app/filters';
import { Logger, ValidationPipe } from '@nestjs/common';

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
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: rpcValidationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new GlobalRpcExceptionFilter());

  await app.listen();
  Logger.log(
    `Orders microservice is listening on TCP port ${ports.orders}`,
    'Orders',
  );
}

void bootstrap();
