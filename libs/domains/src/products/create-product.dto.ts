import { z } from 'zod';

export const createProductSchema = z.strictObject({
  name: z.string().min(2).meta({ example: 'Logitech PRO X2 SUPERSTRIKE' }),
  description: z.string().optional().meta({
    example:
      'PRO X2 SUPERSTRIKE is a breakthrough in ultra-low click-latency technology',
  }),
  price: z
    .number()
    .nonnegative()
    .multipleOf(0.01)
    .meta({ description: 'Price per unit (USD)', example: 179.99 }),
  stock: z.int().nonnegative().optional().meta({ default: 0, example: 50 }),
});

export type CreateProductDto = z.infer<typeof createProductSchema>;
