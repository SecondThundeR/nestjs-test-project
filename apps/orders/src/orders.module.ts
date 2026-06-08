import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  buildDatabaseOptions,
  SERVICE_NAMES,
  servicesConfig,
  validateEnv,
} from '@app/contracts';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderEntity } from './entities/order.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [servicesConfig],
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => buildDatabaseOptions('ORDERS', [OrderEntity]),
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
  providers: [OrdersService],
})
export class OrdersModule {}
