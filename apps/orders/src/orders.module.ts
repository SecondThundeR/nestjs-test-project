import { AppCacheModule } from '@app/cache';
import {
  buildDatabaseOptions,
  type CacheConfig,
  cacheConfig,
  paypalConfig,
  SERVICE_NAMES,
  type ServicesConfig,
  servicesConfig,
  validateEnv,
} from '@app/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ordersHandlers } from './cqrs/handlers';
import { OrderEntity } from './entities/order.entity';
import { ordersMigrations } from './migrations';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaypalService } from './paypal/paypal.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [servicesConfig, cacheConfig, paypalConfig],
      validate: validateEnv,
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
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, PaypalService, ...ordersHandlers],
})
export class OrdersModule {}
