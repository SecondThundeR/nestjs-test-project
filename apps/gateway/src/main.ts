import 'dotenv/config';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type ServicesConfig, servicesConfig } from '@app/config';
import { createWinstonLogger } from '@app/logger';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { load as loadYaml } from 'js-yaml';

import { GatewayModule } from './gateway.module';

function filterPathsByTag(
  paths: OpenAPIObject['paths'],
  tag: string,
): OpenAPIObject['paths'] {
  const hasTag = (operation: unknown): boolean =>
    typeof operation === 'object' &&
    operation !== null &&
    'tags' in operation &&
    Array.isArray((operation as { tags?: unknown }).tags) &&
    (operation as { tags: unknown[] }).tags.includes(tag);

  return Object.fromEntries(
    Object.entries(paths).filter(([, pathItem]) =>
      Object.values(pathItem).some(hasTag),
    ),
  );
}

const CODE_FIRST_TAG = 'products';

function setupCodeFirstDocs(app: NestExpressApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Products API')
    .setDescription('Code First microservice API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  // Make Swagger page to list only Products API endpoints for clarity
  document.paths = filterPathsByTag(document.paths, CODE_FIRST_TAG);
  document.tags = document.tags?.filter((tag) => tag.name === CODE_FIRST_TAG);

  SwaggerModule.setup('api/docs/products', app, document);
}

function setupSchemaFirstDocs(app: NestExpressApplication): void {
  const contractPath = join(
    process.cwd(),
    'apps/gateway/src/orders/orders.openapi.yaml',
  );
  const document = loadYaml(
    readFileSync(contractPath, 'utf8'),
  ) as OpenAPIObject;

  SwaggerModule.setup('api/docs/orders', app, document);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(GatewayModule, {
    logger: createWinstonLogger('Gateway'),
  });

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

  setupCodeFirstDocs(app);
  setupSchemaFirstDocs(app);

  app.enableShutdownHooks();

  await app.listen(services.ports.gateway);
  Logger.log(
    `API Gateway is running on http://localhost:${services.ports.gateway}/api`,
    'Gateway',
  );
  Logger.log(
    `Code First docs: http://localhost:${services.ports.gateway}/api/docs/products`,
    'Gateway',
  );
  Logger.log(
    `Schema First docs: http://localhost:${services.ports.gateway}/api/docs/orders`,
    'Gateway',
  );
}

void bootstrap();
