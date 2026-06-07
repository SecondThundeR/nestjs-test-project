import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SERVICE_HOSTS, SERVICE_NAMES, SERVICE_PORTS } from '@app/contracts';
import { ProductsGatewayController } from './products/products.gateway.controller';
import { CartGatewayController } from './cart/cart.gateway.controller';
import { OrdersGatewayController } from './orders/orders.gateway.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: SERVICE_NAMES.PRODUCTS,
        transport: Transport.TCP,
        options: { host: SERVICE_HOSTS.PRODUCTS, port: SERVICE_PORTS.PRODUCTS },
      },
      {
        name: SERVICE_NAMES.CART,
        transport: Transport.TCP,
        options: { host: SERVICE_HOSTS.CART, port: SERVICE_PORTS.CART },
      },
      {
        name: SERVICE_NAMES.ORDERS,
        transport: Transport.TCP,
        options: { host: SERVICE_HOSTS.ORDERS, port: SERVICE_PORTS.ORDERS },
      },
    ]),
  ],
  controllers: [
    HealthController,
    ProductsGatewayController,
    CartGatewayController,
    OrdersGatewayController,
  ],
})
export class GatewayModule {}
