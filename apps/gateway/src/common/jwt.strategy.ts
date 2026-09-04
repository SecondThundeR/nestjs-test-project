import { type AuthConfig, authConfig, SERVICE_NAMES } from '@app/config';
import { AUTH_PATTERNS, type JwtPayload, type PublicUser } from '@app/domains';
import { Inject, Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { rpcSend } from './rpc.util.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(authConfig.KEY) config: AuthConfig,
    @Inject(SERVICE_NAMES.AUTH) private readonly auth: ClientProxy,
  ) {
    if (!config.secret) {
      throw new Error('JWT_SECRET is required');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.secret,
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    await rpcSend<PublicUser>(this.auth, AUTH_PATTERNS.VERIFY, payload.sid);
    return payload;
  }
}
