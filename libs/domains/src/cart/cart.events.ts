import { z } from 'zod';

import { idSchema } from '../common.schema.js';

export const CART_EVENTS = { UPDATED: 'cart.updated' } as const;
export const cartUpdatedEventPayloadSchema = z.strictObject({
  userId: idSchema,
});
export type CartUpdatedEventPayload = z.infer<
  typeof cartUpdatedEventPayloadSchema
>;
