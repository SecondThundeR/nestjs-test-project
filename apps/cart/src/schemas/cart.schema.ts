import type { Cart } from '@app/domains';
import { EntitySchema } from 'typeorm';

export interface CartDocument extends Cart {
  _id: string;
  version: number;
}

export const CartSchema = new EntitySchema<CartDocument>({
  name: 'Cart',
  tableName: 'carts',
  columns: {
    // Preserve userId as the MongoDB primary key, including existing documents.
    _id: { type: String, objectId: true, primary: true },
    userId: { type: String },
    items: { type: 'json' },
    total: { type: Number },
    updatedAt: { type: String },
    version: { type: Number },
  },
});
