import {
  type AuthResult,
  LoginUserDto,
  type LogoutResult,
  RefreshTokenDto,
  RegisterUserDto,
  USERS_PATTERNS,
} from '@app/domains';
import { SERVICE_NAMES } from '@app/config';
import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { CurrentSessionId } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { rpcSend } from '../common/rpc.util';

@Controller('users')
export class UsersGatewayController {
  constructor(
    @Inject(SERVICE_NAMES.USERS) private readonly users: ClientProxy,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterUserDto) {
    return rpcSend<AuthResult>(this.users, USERS_PATTERNS.REGISTER, dto);
  }

  @Post('login')
  login(@Body() dto: LoginUserDto) {
    return rpcSend<AuthResult>(this.users, USERS_PATTERNS.LOGIN, dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return rpcSend<AuthResult>(this.users, USERS_PATTERNS.REFRESH, dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@CurrentSessionId() sessionId: string) {
    return rpcSend<LogoutResult>(this.users, USERS_PATTERNS.LOGOUT, sessionId);
  }
}
