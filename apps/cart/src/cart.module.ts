import {
  buildDatabaseOptions,
  environmentSchema,
  kafkaConfig,
  KAFKA_CLIENT,
  type KafkaConfig,
  SERVICE_NAMES,
  type ServicesConfig,
  servicesConfig,
} from '@app/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CartEventsPublisher } from './cart-events.publisher.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';
import { cartMigrations } from './migrations/index.js';
import { CartSchema } from './schemas/cart.schema.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [servicesConfig, kafkaConfig],
      validationSchema: environmentSchema,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () =>
        buildDatabaseOptions('CART', [CartSchema], cartMigrations),
    }),
    TypeOrmModule.forFeature([CartSchema]),
    ClientsModule.registerAsync([
      {
        name: KAFKA_CLIENT,
        inject: [kafkaConfig.KEY],
        useFactory: (kafka: KafkaConfig) => ({
          transport: Transport.KAFKA,
          options: {
            client: { clientId: 'cart-publisher', brokers: kafka.brokers },
            producerOnlyMode: true,
            producer: { allowAutoTopicCreation: true },
          },
        }),
      },
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
  providers: [CartService, CartEventsPublisher],
})
export class CartModule {}
