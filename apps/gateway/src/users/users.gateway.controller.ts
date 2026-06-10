import { type PublicUser, USERS_PATTERNS } from '@app/domains';
import { SERVICE_NAMES } from '@app/config';
import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { CurrentUserId } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { rpcSend } from '../common/rpc.util';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersGatewayController {
  constructor(
    @Inject(SERVICE_NAMES.USERS) private readonly users: ClientProxy,
  ) {}

  @Get('me')
  async me(@CurrentUserId() userId: string): Promise<PublicUser> {
    const user = await rpcSend<PublicUser | null>(
      this.users,
      USERS_PATTERNS.FIND_BY_ID,
      userId,
    );

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    return user;
  }
}
