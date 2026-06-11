import { CacheService } from '@app/cache';
import { Test } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { type CreateUserDto } from '@app/domains';
import { createInMemoryDataSource } from '../../../test/utils/in-memory-database';
import { createInMemoryCache } from '../../../test/utils/in-memory-cache';
import { UsersService } from './users.service';
import { UserEntity } from './entities/user.entity';

describe('UsersService', () => {
  let service: UsersService;
  let dataSource: DataSource;
  let cacheStore: Map<string, unknown>;

  beforeEach(async () => {
    dataSource = await createInMemoryDataSource([UserEntity]);
    const { service: cacheService, store } = createInMemoryCache();
    cacheStore = store;

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(UserEntity),
          useValue: dataSource.getRepository(UserEntity),
        },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  function create(overrides: Partial<CreateUserDto> = {}) {
    return service.create({
      email: 'jane@example.com',
      name: 'Jane',
      password: 'password123',
      ...overrides,
    });
  }

  describe('create', () => {
    it('creates a user with a generated id and timestamps', async () => {
      const user = await create();

      expect(user).toMatchObject({ email: 'jane@example.com', name: 'Jane' });
      expect(typeof user.id).toBe('string');
      expect(user.createdAt).toBe(user.updatedAt);
      expect(typeof user.createdAt).toBe('string');
    });

    it('normalizes the email to lower case', async () => {
      const user = await create({ email: 'Jane@Example.COM' });

      expect(user.email).toBe('jane@example.com');
    });

    it('throws RpcException when the email is already registered', async () => {
      await create();

      await expect(create({ email: 'JANE@example.com' })).rejects.toThrow(
        RpcException,
      );
    });
  });

  describe('findByCredentials', () => {
    it('returns the user for valid credentials', async () => {
      const created = await create();

      const user = await service.findByCredentials({
        email: 'jane@example.com',
        password: 'password123',
      });

      expect(user.id).toBe(created.id);
    });

    it('accepts credentials regardless of email casing', async () => {
      const created = await create();

      const user = await service.findByCredentials({
        email: 'JANE@EXAMPLE.COM',
        password: 'password123',
      });

      expect(user.id).toBe(created.id);
    });

    it('throws RpcException for an unknown email', async () => {
      await expect(
        service.findByCredentials({
          email: 'missing@example.com',
          password: 'whatever',
        }),
      ).rejects.toThrow(RpcException);
    });

    it('throws RpcException for a wrong password', async () => {
      await create();

      await expect(
        service.findByCredentials({
          email: 'jane@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toThrow(RpcException);
    });
  });

  describe('findById', () => {
    it('returns the user when it exists', async () => {
      const created = await create();

      await expect(service.findById(created.id)).resolves.toMatchObject({
        id: created.id,
      });
    });

    it('returns null for an unknown id', async () => {
      await expect(service.findById('missing')).resolves.toBeNull();
    });

    it('serves a repeated lookup from the cache', async () => {
      const created = await create();
      const spy = jest.spyOn(dataSource.getRepository(UserEntity), 'findOneBy');

      await service.findById(created.id);
      await service.findById(created.id);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(cacheStore.has(`user:${created.id}`)).toBe(true);
    });
  });
});
