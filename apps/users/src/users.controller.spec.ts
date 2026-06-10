import { Test } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import type {
  CreateUserDto,
  PublicUser,
  ValidateUserByCredentialsDto,
} from '@app/domains';

const PUBLIC_USER = { id: 'u-1' } as PublicUser;

describe('UsersController', () => {
  let usersController: UsersController;
  let usersService: jest.Mocked<
    Pick<UsersService, 'create' | 'findByCredentials' | 'findById'>
  >;

  beforeEach(async () => {
    usersService = {
      create: jest.fn(),
      findByCredentials: jest.fn(),
      findById: jest.fn(),
    };

    const app = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    usersController = app.get<UsersController>(UsersController);
  });

  it('delegates create() to the service with the dto', async () => {
    const dto: CreateUserDto = {
      email: 'jane@example.com',
      name: 'Jane',
      password: 'password123',
    };
    usersService.create.mockResolvedValue(PUBLIC_USER);

    await expect(usersController.create(dto)).resolves.toBe(PUBLIC_USER);
    expect(usersService.create).toHaveBeenCalledWith(dto);
  });

  it('delegates validateCredentials() to the service with the dto', async () => {
    const dto: ValidateUserByCredentialsDto = {
      email: 'jane@example.com',
      password: 'password123',
    };
    usersService.findByCredentials.mockResolvedValue(PUBLIC_USER);

    await expect(usersController.validateCredentials(dto)).resolves.toBe(
      PUBLIC_USER,
    );
    expect(usersService.findByCredentials).toHaveBeenCalledWith(dto);
  });

  it('delegates findById() to the service with the id', async () => {
    usersService.findById.mockResolvedValue(PUBLIC_USER);

    await expect(usersController.findById('u-1')).resolves.toBe(PUBLIC_USER);
    expect(usersService.findById).toHaveBeenCalledWith('u-1');
  });

  it('returns null when the user is not found', async () => {
    usersService.findById.mockResolvedValue(null);

    await expect(usersController.findById('missing')).resolves.toBeNull();
  });
});
