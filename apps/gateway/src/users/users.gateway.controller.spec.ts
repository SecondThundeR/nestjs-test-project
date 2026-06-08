import { Test } from '@nestjs/testing';
import { of } from 'rxjs';
import {
  USERS_PATTERNS,
  type LoginUserDto,
  type RegisterUserDto,
} from '@app/domains';
import { SERVICE_NAMES } from '@app/config';
import { UsersGatewayController } from './users.gateway.controller';

describe('UsersGatewayController', () => {
  let controller: UsersGatewayController;
  let users: { send: jest.Mock };

  beforeEach(async () => {
    users = { send: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [UsersGatewayController],
      providers: [{ provide: SERVICE_NAMES.USERS, useValue: users }],
    }).compile();

    controller = moduleRef.get(UsersGatewayController);
  });

  it('forwards register() as a REGISTER message with the dto', async () => {
    const dto: RegisterUserDto = {
      email: 'jane@example.com',
      name: 'Jane',
      password: 'password123',
    };
    const result = { id: 'u-1' };
    users.send.mockReturnValue(of(result));

    await expect(controller.register(dto)).resolves.toBe(result);
    expect(users.send).toHaveBeenCalledWith(USERS_PATTERNS.REGISTER, dto);
  });

  it('forwards login() as a LOGIN message with the dto', async () => {
    const dto: LoginUserDto = {
      email: 'jane@example.com',
      password: 'password123',
    };
    const result = { id: 'u-1' };
    users.send.mockReturnValue(of(result));

    await expect(controller.login(dto)).resolves.toBe(result);
    expect(users.send).toHaveBeenCalledWith(USERS_PATTERNS.LOGIN, dto);
  });
});
