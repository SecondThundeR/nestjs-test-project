import { EntitySchema } from 'typeorm';
import { isoTransformer, numericTransformer } from '@app/config';
import { type Cart } from '@app/domains';

export const CartSchema = new EntitySchema<Cart>({
  name: 'Cart',
  tableName: 'carts',
  columns: {
    userId: {
      type: String,
      primary: true,
    },
    items: {
      type: 'jsonb',
      default: [],
    },
    total: {
      type: 'numeric',
      precision: 12,
      scale: 2,
      default: 0,
      transformer: numericTransformer,
    },
    updatedAt: {
      type: 'timestamptz',
      updateDate: true,
      transformer: isoTransformer,
    },
  },
});
