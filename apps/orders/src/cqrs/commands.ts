import type { OrderStatus } from '@app/domains';

export class CreateOrderCommand {
  constructor(
    public readonly userId: string,
    public readonly shippingAddress: string,
  ) {}
}

export class UpdateOrderStatusCommand {
  constructor(
    public readonly id: string,
    public readonly status: OrderStatus,
  ) {}
}

export class CancelOrderCommand {
  constructor(
    public readonly id: string,
    public readonly userId?: string,
  ) {}
}

export class PayOrderCommand {
  constructor(
    public readonly id: string,
    public readonly userId?: string,
  ) {}
}

export class CapturePaymentCommand {
  constructor(
    public readonly id: string,
    public readonly userId?: string,
  ) {}
}

export class CaptureByPaymentIdCommand {
  constructor(public readonly paymentId: string) {}
}
