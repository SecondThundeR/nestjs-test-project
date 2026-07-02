import 'dotenv/config';

import { kafkaConfig, servicesConfig } from '@app/config';
import {
  GlobalRpcExceptionFilter,
  rpcValidationExceptionFactory,
} from '@app/filters';
import { createWinstonLogger } from '@app/logger';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';

import { CartModule } from './cart.module';

async function bootstrap() {
  const { ports } = servicesConfig();
  const { brokers } = kafkaConfig();

  const app = await NestFactory.create(CartModule, {
    logger: createWinstonLogger('Cart'),
  });

  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.TCP,
      options: { host: '0.0.0.0', port: ports.cart },
    },
    { inheritAppConfig: true },
  );
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.KAFKA,
      options: {
        client: { clientId: 'cart', brokers },
        consumer: { groupId: 'cart-consumer', allowAutoTopicCreation: true },
      },
    },
    { inheritAppConfig: true },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: rpcValidationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new GlobalRpcExceptionFilter());

  app.enableShutdownHooks();

  await app.startAllMicroservices();
  await app.init();

  Logger.log(
    `Cart microservice is listening on TCP port ${ports.cart} and Kafka brokers ${brokers.join(', ')}`,
    'Cart',
  );
}

void bootstrap();
