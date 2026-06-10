import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  ValidateUserByCredentialsDto,
  CreateUserDto,
  USERS_PATTERNS,
} from '@app/domains';
import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @MessagePattern(USERS_PATTERNS.CREATE)
  async create(@Payload() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @MessagePattern(USERS_PATTERNS.VALIDATE_CREDENTIALS)
  async validateCredentials(@Payload() dto: ValidateUserByCredentialsDto) {
    return this.usersService.findByCredentials(dto);
  }

  @MessagePattern(USERS_PATTERNS.FIND_BY_ID)
  async findById(@Payload() id: string) {
    return this.usersService.findById(id);
  }
}
