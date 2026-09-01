import { SERVICE_NAMES } from '@app/config';
import { type Order, ORDERS_PATTERNS } from '@app/domains';
import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';

import { rpcSend } from '../common/rpc.util.js';

// PayPal redirects the buyer here after checkout, so these routes
// are intentionally left outside the JWT guard
@Controller('orders/payment')
export class OrdersPaymentGatewayController {
  constructor(
    @Inject(SERVICE_NAMES.ORDERS) private readonly orders: ClientProxy,
  ) {}

  @Get('return')
  captureReturn(@Query('token') token?: string) {
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
  cancelReturn() {
    return {
      message:
        'Payment was cancelled. You can restart it for your order at any time.',
    };
  }
}
