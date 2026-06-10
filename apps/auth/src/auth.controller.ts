import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  AUTH_PATTERNS,
  ValidateUserByCredentialsDto,
  RefreshTokenDto,
  CreateUserDto,
} from '@app/domains';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern(AUTH_PATTERNS.REGISTER)
  register(@Payload() dto: CreateUserDto) {
    return this.authService.register(dto);
  }

  @MessagePattern(AUTH_PATTERNS.LOGIN)
  login(@Payload() dto: ValidateUserByCredentialsDto) {
    return this.authService.login(dto);
  }

  @MessagePattern(AUTH_PATTERNS.VERIFY)
  verify(@Payload() token: string) {
    return this.authService.verify(token);
  }

  @MessagePattern(AUTH_PATTERNS.REFRESH)
  refresh(@Payload() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @MessagePattern(AUTH_PATTERNS.LOGOUT)
  logout(@Payload() sessionId: string) {
    return this.authService.logout(sessionId);
  }
}
