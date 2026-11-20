import { type Order, OrderStatus } from '@app/domains';
import { RpcErrors } from '@app/filters';

export function cancellationOperation(
  order: Pick<Order, 'status' | 'captureId'>,
): 'refund' | 'release' {
  switch (order.status) {
    case OrderStatus.SHIPPED:
    case OrderStatus.DELIVERED:
      throw RpcErrors.badRequest('Cannot cancel an order that has shipped');
    case OrderStatus.PAID:
      if (!order.captureId) {
        throw RpcErrors.badRequest('Order has no capture to refund');
      }
      return 'refund';
    case OrderStatus.PENDING:
    case OrderStatus.CANCELLED:
      return 'release';
  }
}
