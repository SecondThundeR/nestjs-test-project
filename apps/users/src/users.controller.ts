import {
  type CreateUserDto,
  createUserSchema,
  idSchema,
  USERS_PATTERNS,
  type ValidateUserByCredentialsDto,
  validateUserByCredentialsSchema,
} from '@app/domains';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { UsersService } from './users.service.js';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @MessagePattern(USERS_PATTERNS.CREATE)
  async create(@Payload({ schema: createUserSchema }) dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @MessagePattern(USERS_PATTERNS.VALIDATE_CREDENTIALS)
  async validateCredentials(
    @Payload({ schema: validateUserByCredentialsSchema })
    dto: ValidateUserByCredentialsDto,
  ) {
    return this.usersService.findByCredentials(dto);
  }

  @MessagePattern(USERS_PATTERNS.FIND_BY_ID)
  async findById(@Payload({ schema: idSchema }) id: string) {
    return this.usersService.findById(id);
  }
}
