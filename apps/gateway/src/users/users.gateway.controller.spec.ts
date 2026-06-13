import { authConfig, SERVICE_NAMES } from '@app/config';
import { USERS_PATTERNS } from '@app/domains';
import { NotFoundException } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';

import { UsersGatewayController } from './users.gateway.controller';

describe('UsersGatewayController', () => {
  let controller: UsersGatewayController;
  let users: { send: jest.Mock };

  beforeEach(async () => {
    users = { send: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: authConfig().secret })],
      controllers: [UsersGatewayController],
      providers: [
        { provide: SERVICE_NAMES.USERS, useValue: users },
        { provide: SERVICE_NAMES.AUTH, useValue: { send: jest.fn() } },
      ],
    }).compile();

    controller = moduleRef.get(UsersGatewayController);
  });

  it('forwards me() as a FIND_BY_ID message with the userId', async () => {
    const result = { id: 'u-1', email: 'jane@example.com', name: 'Jane' };
    users.send.mockReturnValue(of(result));

    await expect(controller.me('u-1')).resolves.toBe(result);
    expect(users.send).toHaveBeenCalledWith(USERS_PATTERNS.FIND_BY_ID, 'u-1');
  });

  it('throws NotFoundException when the user no longer exists', async () => {
    users.send.mockReturnValue(of(null));

    await expect(controller.me('missing')).rejects.toThrow(NotFoundException);
  });
});
