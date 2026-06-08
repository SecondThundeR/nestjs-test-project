import { NestFactory } from '@nestjs/core';
import { GatewayModule } from './gateway.module';
import { type ServicesConfig, servicesConfig } from '@app/contracts';
import { Logger, ValidationPipe } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(GatewayModule);

  const services = app.get<ServicesConfig>(servicesConfig.KEY);

  app.disable('x-powered-by');
  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(services.ports.gateway);
  Logger.log(
    `API Gateway is running on http://localhost:${services.ports.gateway}/api`,
    'Gateway',
  );
}

void bootstrap();
