import { Test } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import type { LoginUserDto, RegisterUserDto } from '@app/contracts';

describe('UsersController', () => {
  let usersController: UsersController;
  let usersService: jest.Mocked<Pick<UsersService, 'register' | 'login'>>;

  beforeEach(async () => {
    usersService = {
      register: jest.fn(),
      login: jest.fn(),
    };

    const app = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    usersController = app.get<UsersController>(UsersController);
  });

  it('delegates register() to the service with the dto', () => {
    const dto: RegisterUserDto = {
      email: 'jane@example.com',
      name: 'Jane',
      password: 'password123',
    };
    const user = {} as never;
    usersService.register.mockReturnValue(user);

    expect(usersController.register(dto)).toBe(user);
    expect(usersService.register).toHaveBeenCalledWith(dto);
  });

  it('delegates login() to the service with the dto', () => {
    const dto: LoginUserDto = {
      email: 'jane@example.com',
      password: 'password123',
    };
    const user = {} as never;
    usersService.login.mockReturnValue(user);

    expect(usersController.login(dto)).toBe(user);
    expect(usersService.login).toHaveBeenCalledWith(dto);
  });
});
