import { NestFactory } from '@nestjs/core';
import { OrdersModule } from './orders.module';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';
import { GlobalRpcExceptionFilter, SERVICE_PORTS } from '@app/contracts';
import { Logger, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    OrdersModule,
    {
      transport: Transport.TCP,
      options: { host: '0.0.0.0', port: SERVICE_PORTS.ORDERS },
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
    `Orders microservice is listening on TCP port ${SERVICE_PORTS.ORDERS}`,
    'Orders',
  );
}

void bootstrap();
