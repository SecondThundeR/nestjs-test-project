import {
  LoginUserDto,
  type PublicUser,
  RegisterUserDto,
  USERS_PATTERNS,
} from '@app/domains';
import { SERVICE_NAMES } from '@app/config';
import { Body, Controller, Inject, Post } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { rpcSend } from '../common/rpc.util';

@Controller('users')
export class UsersGatewayController {
  constructor(
    @Inject(SERVICE_NAMES.USERS) private readonly users: ClientProxy,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterUserDto) {
    return rpcSend<PublicUser>(this.users, USERS_PATTERNS.REGISTER, dto);
  }

  @Post('login')
  login(@Body() dto: LoginUserDto) {
    return rpcSend<PublicUser>(this.users, USERS_PATTERNS.LOGIN, dto);
  }
}
