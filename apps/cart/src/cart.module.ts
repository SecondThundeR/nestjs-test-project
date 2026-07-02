import {
  buildDatabaseOptions,
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

import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { cartHandlers } from './cqrs/handlers';
import { cartMigrations } from './migrations';
import { CartSchema } from './schemas/cart.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [servicesConfig],
      validate: validateEnv,
    }),
    CqrsModule.forRoot(),
    TypeOrmModule.forRootAsync({
      useFactory: () =>
        buildDatabaseOptions('CART', [CartSchema], cartMigrations),
    }),
    TypeOrmModule.forFeature([CartSchema]),
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
    ]),
  ],
  controllers: [CartController],
  providers: [CartService, ...cartHandlers],
})
export class CartModule {}
