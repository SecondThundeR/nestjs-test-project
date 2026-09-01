import { z } from 'zod';

export const refreshTokenSchema = z.strictObject({
  refreshToken: z.string().min(1),
});
export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;
