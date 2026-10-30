import { KAFKA_CLIENT } from '@app/config';
import { CART_EVENTS } from '@app/domains';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { defer } from 'rxjs';
import type { ClientKafka } from '@nestjs/microservices';

@Injectable()
export class CartEventsPublisher
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(CartEventsPublisher.name);

  constructor(@Inject(KAFKA_CLIENT) private readonly kafka: ClientKafka) { }

  async onModuleInit() {
    await this.kafka.connect();
  }

  async onApplicationShutdown() {
    await this.kafka.close();
  }

  updated(userId: string): void {
    defer(() =>
      this.kafka.emit(CART_EVENTS.UPDATED, { key: userId, value: { userId } }),
    ).subscribe({
      error: (error: unknown) =>
        this.logger.error(`Failed to publish cart.updated: ${String(error)}`),
    });
  }
}
