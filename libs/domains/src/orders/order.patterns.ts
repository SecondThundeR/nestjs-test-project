export const ORDERS_PATTERNS = {
  CREATE: 'order.create',
  FIND_ALL: 'order.findAll',
  FIND_ONE: 'order.findOne',
  UPDATE_STATUS: 'order.updateStatus',
  CANCEL: 'order.cancel',
  PAY: 'order.pay',
  CAPTURE_PAYMENT: 'order.capturePayment',
  CAPTURE_BY_PAYMENT_ID: 'order.captureByPaymentId',
} as const;
