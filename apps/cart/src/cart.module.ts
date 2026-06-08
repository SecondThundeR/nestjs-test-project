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
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartEntity } from './entities/cart.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [servicesConfig],
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => buildDatabaseOptions('CART', [CartEntity]),
    }),
    TypeOrmModule.forFeature([CartEntity]),
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
    ]),
  ],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
