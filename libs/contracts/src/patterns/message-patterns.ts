export const PRODUCT_PATTERNS = {
  CREATE: 'product.create',
  FIND_ALL: 'product.findAll',
  FIND_ONE: 'product.findOne',
  FIND_MANY: 'product.findMany',
  UPDATE: 'product.update',
  REMOVE: 'product.remove',
} as const;

export const CART_PATTERNS = {
  GET: 'cart.get',
  ADD_ITEM: 'cart.addItem',
  UPDATE_ITEM: 'cart.updateItem',
  REMOVE_ITEM: 'cart.removeItem',
  CLEAR: 'cart.clear',
} as const;

export const ORDERS_PATTERNS = {
  CREATE: 'order.create',
  FIND_ALL: 'order.findAll',
  FIND_ONE: 'order.findOne',
  UPDATE_STATUS: 'order.updateStatus',
  CANCEL: 'order.cancel',
} as const;
