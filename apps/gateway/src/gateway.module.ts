import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { JwtModule } from '@nestjs/jwt';
import {
  authConfig,
  SERVICE_NAMES,
  servicesConfig,
  validateEnv,
} from '@app/config';
import { ProductsGatewayController } from './products/products.gateway.controller';
import { CartGatewayController } from './cart/cart.gateway.controller';
import { OrdersGatewayController } from './orders/orders.gateway.controller';
import { HealthController } from './health.controller';
import { UsersGatewayController } from './users/users.gateway.controller';
import { AuthGatewayController } from './auth/auth.gateway.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [authConfig, servicesConfig],
      validate: validateEnv,
    }),
    JwtModule.registerAsync({
      inject: [authConfig.KEY],
      useFactory: (auth: ConfigType<typeof authConfig>) => ({
        secret: auth.secret,
      }),
    }),
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
      {
        name: SERVICE_NAMES.ORDERS,
        inject: [servicesConfig.KEY],
        useFactory: (services: ConfigType<typeof servicesConfig>) => ({
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
        useFactory: (services: ConfigType<typeof servicesConfig>) => ({
          transport: Transport.TCP,
          options: { host: services.hosts.users, port: services.ports.users },
        }),
      },
      {
        name: SERVICE_NAMES.AUTH,
        inject: [servicesConfig.KEY],
        useFactory: (services: ConfigType<typeof servicesConfig>) => ({
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
    UsersGatewayController,
    AuthGatewayController,
  ],
})
export class GatewayModule {}
