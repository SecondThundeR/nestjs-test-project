import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';

export const authConfig = registerAs('auth', () => ({
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  refreshTtlMs: Number(process.env.REFRESH_TTL_DAYS ?? 7) * 24 * 60 * 60 * 1000,
}));

export type AuthConfig = ConfigType<typeof authConfig>;
