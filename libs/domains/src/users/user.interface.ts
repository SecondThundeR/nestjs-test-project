import { z } from 'zod';

import { idSchema, isoDateTimeSchema } from '../common.schema.js';

export enum UserRole {
  REGULAR = 'regular',
  ADMIN = 'admin',
}

export const userRoleSchema = z.enum(UserRole);

export const userSchema = z.object({
  id: idSchema,
  email: z.email(),
  name: z.string(),
  passwordHash: z.string(),
  role: userRoleSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type User = z.infer<typeof userSchema>;

export const publicUserSchema = userSchema.omit({ passwordHash: true });
export type PublicUser = z.infer<typeof publicUserSchema>;
