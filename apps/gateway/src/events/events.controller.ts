import {
  CART_EVENTS,
  cartUpdatedEventPayloadSchema,
  ORDER_EVENTS,
  orderCreatedEventPayloadSchema,
  orderStatusChangedEventPayloadSchema,
} from '@app/domains';
import { Controller, Logger, Req, Sse, UseGuards } from '@nestjs/common';
import { EventPattern, Payload, Transport } from '@nestjs/microservices';

import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../common/jwt-auth.guard.js';
import { EventsService } from './events.service.js';

@Controller('events')
export class EventsController {
  private readonly logger = new Logger(EventsController.name);
  constructor(private readonly events: EventsService) {}

  @Sse()
  @UseGuards(JwtAuthGuard)
  stream(@Req() request: AuthenticatedRequest) {
    return this.events.stream(request.user);
  }

  @EventPattern(ORDER_EVENTS.CREATED, Transport.KAFKA)
  created(@Payload() payload: unknown) {
    this.order(ORDER_EVENTS.CREATED, payload, true);
  }
  @EventPattern(ORDER_EVENTS.PAID, Transport.KAFKA)
  paid(@Payload() payload: unknown) {
    this.order(ORDER_EVENTS.PAID, payload);
  }
  @EventPattern(ORDER_EVENTS.CANCELLED, Transport.KAFKA)
  cancelled(@Payload() payload: unknown) {
    this.order(ORDER_EVENTS.CANCELLED, payload);
  }
  @EventPattern(ORDER_EVENTS.STATUS_CHANGED, Transport.KAFKA)
  statusChanged(@Payload() payload: unknown) {
    this.order(ORDER_EVENTS.STATUS_CHANGED, payload);
  }
  @EventPattern(CART_EVENTS.UPDATED, Transport.KAFKA)
  cartUpdated(@Payload() payload: unknown) {
    const result = cartUpdatedEventPayloadSchema.safeParse(payload);
    if (!result.success) {
      this.logger.warn('Discarding malformed cart event');
      return;
    }
    this.events.publish({
      userId: result.data.userId,
      type: CART_EVENTS.UPDATED,
      data: {},
    });
  }
  private order(type: string, payload: unknown, created = false): void {
    const result = (
      created
        ? orderCreatedEventPayloadSchema
        : orderStatusChangedEventPayloadSchema
    ).safeParse(payload);
    if (!result.success) {
      this.logger.warn(`Discarding malformed ${type} event`);
      return;
    }
    this.events.publish({
      userId: result.data.userId,
      type,
      data: { orderId: result.data.orderId },
    });
  }
}
