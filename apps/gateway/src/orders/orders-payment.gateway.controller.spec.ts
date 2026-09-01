import { SERVICE_NAMES } from '@app/config';
import { ORDERS_PATTERNS, OrderStatus } from '@app/domains';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';
import type { Mock } from 'vitest';

import { OrdersPaymentGatewayController } from './orders-payment.gateway.controller.js';

describe('OrdersPaymentGatewayController', () => {
  let controller: OrdersPaymentGatewayController;
  let orders: { send: Mock };

  beforeEach(async () => {
    orders = { send: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersPaymentGatewayController],
      providers: [{ provide: SERVICE_NAMES.ORDERS, useValue: orders }],
    }).compile();

    controller = moduleRef.get(OrdersPaymentGatewayController);
  });

  it('captures the payment matching the PayPal return token', async () => {
    const result = { id: 'o-1', status: OrderStatus.PAID };
    orders.send.mockReturnValue(of(result));

    await expect(controller.captureReturn('pp-1')).resolves.toBe(result);
    expect(orders.send).toHaveBeenCalledWith(
      ORDERS_PATTERNS.CAPTURE_BY_PAYMENT_ID,
      'pp-1',
    );
  });

  it('rejects a return without a token', () => {
    expect(() => controller.captureReturn(undefined)).toThrow(
      BadRequestException,
    );
    expect(orders.send).not.toHaveBeenCalled();
  });

  it('returns a message when the buyer cancels the payment', () => {
    expect(controller.cancelReturn()).toEqual({
      message: expect.stringContaining('cancelled') as string,
    });
  });
});
