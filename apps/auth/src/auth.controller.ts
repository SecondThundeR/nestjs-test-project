import {
  AUTH_PATTERNS,
  type CreateUserDto,
  createUserSchema,
  idSchema,
  type RefreshTokenDto,
  refreshTokenSchema,
  type ValidateUserByCredentialsDto,
  validateUserByCredentialsSchema,
} from '@app/domains';
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { AuthService } from './auth.service.js';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern(AUTH_PATTERNS.REGISTER)
  register(@Payload({ schema: createUserSchema }) dto: CreateUserDto) {
    return this.authService.register(dto);
  }

  @MessagePattern(AUTH_PATTERNS.LOGIN)
  login(
    @Payload({ schema: validateUserByCredentialsSchema })
    dto: ValidateUserByCredentialsDto,
  ) {
    return this.authService.login(dto);
  }

  @MessagePattern(AUTH_PATTERNS.VERIFY)
  verify(@Payload({ schema: idSchema }) sessionId: string) {
    return this.authService.verify(sessionId);
  }

  @MessagePattern(AUTH_PATTERNS.REFRESH)
  refresh(@Payload({ schema: refreshTokenSchema }) dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @MessagePattern(AUTH_PATTERNS.LOGOUT)
  logout(@Payload({ schema: idSchema }) sessionId: string) {
    return this.authService.logout(sessionId);
  }
}
