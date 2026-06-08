import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { UsersModule } from './users.module';
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
    UsersModule,
    {
      transport: Transport.TCP,
      options: { host: '0.0.0.0', port: ports.users },
      logger: createWinstonLogger('Users'),
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
    `Users microservice is listening on TCP port ${ports.users}`,
    'Users',
  );
}

void bootstrap();
