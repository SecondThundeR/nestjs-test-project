import { NestFactory } from '@nestjs/core';
import { GatewayModule } from './gateway.module';
import { SERVICE_PORTS } from '@app/contracts';
import { Logger, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(GatewayModule);

  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(SERVICE_PORTS.GATEWAY);
  Logger.log(
    `API Gateway is running on http://localhost:${SERVICE_PORTS.GATEWAY}/api`,
    'Gateway',
  );
}

void bootstrap();
