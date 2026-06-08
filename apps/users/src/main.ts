import { NestFactory } from '@nestjs/core';
import { UsersModule } from './users.module';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';
import { GlobalRpcExceptionFilter, SERVICE_PORTS } from '@app/contracts';
import { Logger, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    UsersModule,
    {
      transport: Transport.TCP,
      options: { host: '0.0.0.0', port: SERVICE_PORTS.USERS },
    },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalRpcExceptionFilter());

  await app.listen();
  Logger.log(
    `Users microservice is listening on TCP port ${SERVICE_PORTS.USERS}`,
    'Users',
  );
}

void bootstrap();
