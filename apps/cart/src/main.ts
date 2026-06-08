import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { CartModule } from './cart.module';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger, ValidationPipe } from '@nestjs/common';
import { servicesConfig } from '@app/config';
import { createWinstonLogger } from '@app/logger';
import {
  GlobalRpcExceptionFilter,
  rpcValidationExceptionFactory,
} from '@app/filters';

async function bootstrap() {
  const { ports } = servicesConfig();
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    CartModule,
    {
      transport: Transport.TCP,
      options: { host: '0.0.0.0', port: ports.cart },
      logger: createWinstonLogger('Cart'),
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
    `Cart microservice is listening on TCP port ${ports.cart}`,
    'Cart',
  );
}

void bootstrap();
