import { SERVICE_NAMES } from '@app/config';
import { USERS_PATTERNS } from '@app/domains';
import { NotFoundException } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';
import type { Mock } from 'vitest';

import { UsersGatewayController } from './users.gateway.controller.js';

describe('UsersGatewayController', () => {
  let controller: UsersGatewayController;
  let users: { send: Mock };

  beforeEach(async () => {
    users = { send: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule.register({ session: false })],
      controllers: [UsersGatewayController],
      providers: [
        { provide: SERVICE_NAMES.USERS, useValue: users },
        { provide: SERVICE_NAMES.AUTH, useValue: { send: vi.fn() } },
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
