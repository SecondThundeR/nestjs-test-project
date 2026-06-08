import {
  type LoginUserDto,
  type PublicUser,
  type RegisterUserDto,
  SERVICE_NAMES,
  USERS_PATTERNS,
} from '@app/contracts';
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
