import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type {
  ValidateUserByCredentialsDto,
  RefreshTokenDto,
  CreateUserDto,
} from '@app/domains';

describe('AuthController', () => {
  let authController: AuthController;
  let authService: jest.Mocked<
    Pick<AuthService, 'register' | 'login' | 'verify' | 'refresh' | 'logout'>
  >;

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      verify: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    };

    const app = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    authController = app.get<AuthController>(AuthController);
  });

  it('delegates register() to the service with the dto', () => {
    const dto: CreateUserDto = {
      email: 'jane@example.com',
      name: 'Jane',
      password: 'password123',
    };
    const result = {} as never;
    authService.register.mockReturnValue(result);

    expect(authController.register(dto)).toBe(result);
    expect(authService.register).toHaveBeenCalledWith(dto);
  });

  it('delegates login() to the service with the dto', () => {
    const dto: ValidateUserByCredentialsDto = {
      email: 'jane@example.com',
      password: 'password123',
    };
    const result = {} as never;
    authService.login.mockReturnValue(result);

    expect(authController.login(dto)).toBe(result);
    expect(authService.login).toHaveBeenCalledWith(dto);
  });

  it('delegates verify() to the service with the token', () => {
    const result = {} as never;
    authService.verify.mockReturnValue(result);

    expect(authController.verify('a.b.c')).toBe(result);
    expect(authService.verify).toHaveBeenCalledWith('a.b.c');
  });

  it('delegates refresh() to the service with the dto', () => {
    const dto: RefreshTokenDto = { refreshToken: 'refresh-token' };
    const result = {} as never;
    authService.refresh.mockReturnValue(result);

    expect(authController.refresh(dto)).toBe(result);
    expect(authService.refresh).toHaveBeenCalledWith(dto);
  });

  it('delegates logout() to the service with the session id', () => {
    const result = {} as never;
    authService.logout.mockReturnValue(result);

    expect(authController.logout('session-1')).toBe(result);
    expect(authService.logout).toHaveBeenCalledWith('session-1');
  });
});
