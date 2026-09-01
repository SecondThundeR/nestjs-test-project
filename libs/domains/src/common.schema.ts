import { z } from 'zod';

export const idSchema = z.string().min(1);
export const optionalIdSchema = idSchema.optional();
export const idListSchema = z.array(idSchema);
export const isoDateTimeSchema = z.iso.datetime();
export const moneySchema = z.number().nonnegative();
