import { z } from 'zod';

import { idSchema, isoDateTimeSchema } from '../common.schema.js';
import { publicUserSchema, userRoleSchema } from '../users/index.js';

export const sessionSchema = z.object({
  id: idSchema,
  userId: idSchema,
  refreshTokenHash: z.string(),
  expiresAt: isoDateTimeSchema,
  revokedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type Session = z.infer<typeof sessionSchema>;

export const jwtPayloadSchema = z.object({
  sub: idSchema,
  email: z.email(),
  sid: idSchema,
  role: userRoleSchema,
});
export type JwtPayload = z.infer<typeof jwtPayloadSchema>;

export const authResultSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  user: publicUserSchema,
});
export type AuthResult = z.infer<typeof authResultSchema>;

export const logoutResultSchema = z.object({ success: z.boolean() });
export type LogoutResult = z.infer<typeof logoutResultSchema>;
