import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SERVICE_HOSTS, SERVICE_NAMES, SERVICE_PORTS } from '@app/contracts';

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
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
