import { registerAs } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';

export const authConfig = registerAs('auth', () => ({
  secret: process.env.JWT_SECRET ?? 'secret',
  expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
}));

export type AuthConfig = ConfigType<typeof authConfig>;
