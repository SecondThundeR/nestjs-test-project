import {
  type AuthConfig,
  authConfig,
  SERVICE_NAMES,
  type ServicesConfig,
  servicesConfig,
  validateEnv,
} from '@app/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { AuthGatewayController } from './auth/auth.gateway.controller';
import { CartGatewayController } from './cart/cart.gateway.controller';
import { HealthController } from './health.controller';
import { OrdersGatewayController } from './orders/orders.gateway.controller';
import { OrdersPaymentGatewayController } from './orders/orders-payment.gateway.controller';
import { ProductsGatewayController } from './products/products.gateway.controller';
import { UsersGatewayController } from './users/users.gateway.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [authConfig, servicesConfig],
      validate: validateEnv,
    }),
    JwtModule.registerAsync({
      inject: [authConfig.KEY],
      useFactory: (auth: AuthConfig) => ({
        secret: auth.secret,
      }),
    }),
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
        name: SERVICE_NAMES.ORDERS,
        inject: [servicesConfig.KEY],
        useFactory: (services: ServicesConfig) => ({
          transport: Transport.TCP,
          options: {
            host: services.hosts.orders,
            port: services.ports.orders,
          },
        }),
      },
      {
        name: SERVICE_NAMES.USERS,
        inject: [servicesConfig.KEY],
        useFactory: (services: ServicesConfig) => ({
          transport: Transport.TCP,
          options: { host: services.hosts.users, port: services.ports.users },
        }),
      },
      {
        name: SERVICE_NAMES.AUTH,
        inject: [servicesConfig.KEY],
        useFactory: (services: ServicesConfig) => ({
          transport: Transport.TCP,
          options: { host: services.hosts.auth, port: services.ports.auth },
        }),
      },
    ]),
  ],
  controllers: [
    HealthController,
    ProductsGatewayController,
    CartGatewayController,
    OrdersGatewayController,
    OrdersPaymentGatewayController,
    UsersGatewayController,
    AuthGatewayController,
  ],
})
export class GatewayModule {}
