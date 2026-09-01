import { SERVICE_NAMES } from '@app/config';
import { type Order, orderSchema, ORDERS_PATTERNS } from '@app/domains';
import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  SerializeOptions,
} from '@nestjs/common';
import { z } from 'zod';
import type { ClientProxy } from '@nestjs/microservices';

import { rpcSend } from '../common/rpc.util.js';

const paymentTokenSchema = z.string().min(1);
const paymentCancelledSchema = z.object({ message: z.string() });

// PayPal redirects the buyer here after checkout, so these routes
// are intentionally left outside the JWT guard
@Controller('orders/payment')
export class OrdersPaymentGatewayController {
  constructor(
    @Inject(SERVICE_NAMES.ORDERS) private readonly orders: ClientProxy,
  ) {}

  @Get('return')
  @SerializeOptions({ schema: orderSchema })
  captureReturn(
    @Query('token', { schema: paymentTokenSchema }) token?: string,
  ) {
    if (!token) {
      throw new BadRequestException('Missing token query parameter');
    }

    return rpcSend<Order>(
      this.orders,
      ORDERS_PATTERNS.CAPTURE_BY_PAYMENT_ID,
      token,
    );
  }

  @Get('cancel')
  @SerializeOptions({ schema: paymentCancelledSchema })
  cancelReturn() {
    return {
      message:
        'Payment was cancelled. You can restart it for your order at any time.',
    };
  }
}
