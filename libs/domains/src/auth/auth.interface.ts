import type { PublicUser } from '../users';

export interface Session {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  sid: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export interface LogoutResult {
  success: boolean;
}
