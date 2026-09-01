import { SERVICE_NAMES } from '@app/config';
import {
  AUTH_PATTERNS,
  authResultSchema,
  type AuthResult,
  type CreateUserDto,
  createUserSchema,
  logoutResultSchema,
  type LogoutResult,
  type RefreshTokenDto,
  refreshTokenSchema,
  type ValidateUserByCredentialsDto,
  validateUserByCredentialsSchema,
} from '@app/domains';
import {
  Body,
  Controller,
  Inject,
  Post,
  SerializeOptions,
  UseGuards,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';

import { CurrentSessionId } from '../common/current-user.decorator.js';
import { JwtAuthGuard } from '../common/jwt-auth.guard.js';
import { rpcSend } from '../common/rpc.util.js';

@Controller('auth')
export class AuthGatewayController {
  constructor(@Inject(SERVICE_NAMES.AUTH) private readonly auth: ClientProxy) {}

  @Post('register')
  @SerializeOptions({ schema: authResultSchema })
  register(@Body({ schema: createUserSchema }) dto: CreateUserDto) {
    return rpcSend<AuthResult>(this.auth, AUTH_PATTERNS.REGISTER, dto);
  }

  @Post('login')
  @SerializeOptions({ schema: authResultSchema })
  login(
    @Body({ schema: validateUserByCredentialsSchema })
    dto: ValidateUserByCredentialsDto,
  ) {
    return rpcSend<AuthResult>(this.auth, AUTH_PATTERNS.LOGIN, dto);
  }

  @Post('refresh')
  @SerializeOptions({ schema: authResultSchema })
  refresh(@Body({ schema: refreshTokenSchema }) dto: RefreshTokenDto) {
    return rpcSend<AuthResult>(this.auth, AUTH_PATTERNS.REFRESH, dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @SerializeOptions({ schema: logoutResultSchema })
  logout(@CurrentSessionId() sessionId: string) {
    return rpcSend<LogoutResult>(this.auth, AUTH_PATTERNS.LOGOUT, sessionId);
  }
}
