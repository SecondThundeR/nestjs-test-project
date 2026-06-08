import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { CartModule } from './cart.module';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';
import {
  createWinstonLogger,
  GlobalRpcExceptionFilter,
  rpcValidationExceptionFactory,
  servicesConfig,
} from '@app/contracts';
import { Logger, ValidationPipe } from '@nestjs/common';

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
