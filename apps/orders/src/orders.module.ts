import { AppCacheModule } from '@app/cache';
import {
  buildDatabaseOptions,
  type CacheConfig,
  cacheConfig,
  environmentSchema,
  KAFKA_CLIENT,
  type KafkaConfig,
  kafkaConfig,
  paypalConfig,
  SERVICE_NAMES,
  type ServicesConfig,
  servicesConfig,
} from '@app/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ordersEventHandlers } from './cqrs/event-handlers.js';
import { ordersHandlers } from './cqrs/handlers.js';
import { OrderEntity } from './entities/order.entity.js';
import { ordersMigrations } from './migrations/index.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { PaypalService } from './paypal/paypal.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [servicesConfig, cacheConfig, paypalConfig, kafkaConfig],
      validationSchema: environmentSchema,
    }),
    CqrsModule.forRoot(),
    AppCacheModule.registerAsync({
      inject: [cacheConfig.KEY],
      useFactory: (cache: CacheConfig) => ({
        namespace: 'orders',
        ttl: cache.ordersCacheTtl,
        redis: cache.redis,
      }),
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () =>
        buildDatabaseOptions('ORDERS', [OrderEntity], ordersMigrations),
    }),
    TypeOrmModule.forFeature([OrderEntity]),
    ClientsModule.registerAsync([
      {
        name: SERVICE_NAMES.PRODUCTS,
        inject: [servicesConfig.KEY],
        useFactory: (services: ServicesConfig) => ({
          transport: Transport.TCP,
          options: {
            host: services.hosts.products,
            port: services.ports.products,
          },
        }),
      },
      {
        name: SERVICE_NAMES.CART,
        inject: [servicesConfig.KEY],
        useFactory: (services: ServicesConfig) => ({
          transport: Transport.TCP,
          options: { host: services.hosts.cart, port: services.ports.cart },
        }),
      },
      {
        name: KAFKA_CLIENT,
        inject: [kafkaConfig.KEY],
        useFactory: (kafka: KafkaConfig) => ({
          transport: Transport.KAFKA,
          options: {
            client: { clientId: 'orders', brokers: kafka.brokers },
            producerOnlyMode: true,
            producer: { allowAutoTopicCreation: true },
          },
        }),
      },
    ]),
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    PaypalService,
    ...ordersHandlers,
    ...ordersEventHandlers,
  ],
})
export class OrdersModule {}
