import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ClientProxy } from '@nestjs/microservices';
import type { Request } from 'express';
import { type JwtPayload, type PublicUser, USERS_PATTERNS } from '@app/domains';
import { SERVICE_NAMES } from '@app/config';
import { rpcSend } from './rpc.util';

export type AuthenticatedRequest = Request & { user: JwtPayload };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(SERVICE_NAMES.USERS) private readonly users: ClientProxy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    await rpcSend<PublicUser>(this.users, USERS_PATTERNS.VERIFY, token);

    request.user = payload;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.header('authorization')?.split(' ') ?? [];
    return type === 'Bearer' && token ? token : undefined;
  }
}
