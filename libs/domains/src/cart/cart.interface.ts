export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface Cart {
  userId: string;
  items: CartItem[];
  total: number;
  updatedAt: string;
}
