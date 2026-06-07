import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SERVICE_NAMES, SERVICE_HOSTS, SERVICE_PORTS } from '@app/contracts';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: SERVICE_NAMES.PRODUCTS,
        transport: Transport.TCP,
        options: { host: SERVICE_HOSTS.PRODUCTS, port: SERVICE_PORTS.PRODUCTS },
      },
    ]),
  ],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
