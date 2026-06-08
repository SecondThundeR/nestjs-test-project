import { NestFactory } from '@nestjs/core';
import { CartModule } from './cart.module';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';
import { GlobalRpcExceptionFilter, SERVICE_PORTS } from '@app/contracts';
import { Logger, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    CartModule,
    {
      transport: Transport.TCP,
      options: { host: '0.0.0.0', port: SERVICE_PORTS.CART },
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
    `Cart microservice is listening on TCP port ${SERVICE_PORTS.CART}`,
    'Cart',
  );
}

void bootstrap();
