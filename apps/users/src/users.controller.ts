import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UsersService } from './users.service';
import { LoginUserDto, RegisterUserDto, USERS_PATTERNS } from '@app/domains';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @MessagePattern(USERS_PATTERNS.REGISTER)
  register(@Payload() dto: RegisterUserDto) {
    return this.usersService.register(dto);
  }

  @MessagePattern(USERS_PATTERNS.LOGIN)
  login(@Payload() dto: LoginUserDto) {
    return this.usersService.login(dto);
  }

  @MessagePattern(USERS_PATTERNS.VERIFY)
  verify(@Payload() token: string) {
    return this.usersService.verify(token);
  }
}
