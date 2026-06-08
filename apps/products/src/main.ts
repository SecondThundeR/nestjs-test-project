import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ProductsModule } from './products.module';
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
    ProductsModule,
    {
      transport: Transport.TCP,
      options: { host: '0.0.0.0', port: ports.products },
      logger: createWinstonLogger('Products'),
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
    `Products microservice is listening on TCP port ${ports.products}`,
    'Products',
  );
}

void bootstrap();
