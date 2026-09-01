import { z } from 'zod';

import { idSchema } from '../common.schema.js';
import { createProductSchema } from './create-product.dto.js';

export const updateProductSchema = createProductSchema.partial();
export type UpdateProductDto = z.infer<typeof updateProductSchema>;

export const updateProductPayloadSchema = z.strictObject({
  id: idSchema,
  data: updateProductSchema,
});
export type UpdateProductPayload = z.infer<typeof updateProductPayloadSchema>;
