import { SERVICE_NAMES } from '@app/config';
import {
  AUTH_PATTERNS,
  type AuthResult,
  CreateUserDto,
  type LogoutResult,
  RefreshTokenDto,
  ValidateUserByCredentialsDto,
} from '@app/domains';
import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';

import { CurrentSessionId } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { rpcSend } from '../common/rpc.util';

@Controller('auth')
export class AuthGatewayController {
  constructor(@Inject(SERVICE_NAMES.AUTH) private readonly auth: ClientProxy) {}

  @Post('register')
  register(@Body() dto: CreateUserDto) {
    return rpcSend<AuthResult>(this.auth, AUTH_PATTERNS.REGISTER, dto);
  }

  @Post('login')
  login(@Body() dto: ValidateUserByCredentialsDto) {
    return rpcSend<AuthResult>(this.auth, AUTH_PATTERNS.LOGIN, dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return rpcSend<AuthResult>(this.auth, AUTH_PATTERNS.REFRESH, dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@CurrentSessionId() sessionId: string) {
    return rpcSend<LogoutResult>(this.auth, AUTH_PATTERNS.LOGOUT, sessionId);
  }
}
