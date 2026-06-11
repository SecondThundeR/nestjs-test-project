import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppCacheModule } from '@app/cache';
import {
  buildDatabaseOptions,
  cacheConfig,
  paypalConfig,
  SERVICE_NAMES,
  servicesConfig,
  validateEnv,
} from '@app/config';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderEntity } from './entities/order.entity';
import { ordersMigrations } from './migrations';
import { PaypalService } from './paypal/paypal.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [servicesConfig, cacheConfig, paypalConfig],
      validate: validateEnv,
    }),
    AppCacheModule.registerAsync({
      inject: [cacheConfig.KEY],
      useFactory: (cache: ConfigType<typeof cacheConfig>) => ({
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
        useFactory: (services: ConfigType<typeof servicesConfig>) => ({
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
        useFactory: (services: ConfigType<typeof servicesConfig>) => ({
          transport: Transport.TCP,
          options: { host: services.hosts.cart, port: services.ports.cart },
        }),
      },
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, PaypalService],
})
export class OrdersModule {}
