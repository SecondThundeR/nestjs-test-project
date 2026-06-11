export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  shippingAddress: string;
  paymentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderPayment {
  orderId: string;
  paymentId: string;
  paymentStatus: string;
  approveUrl: string | null;
}
