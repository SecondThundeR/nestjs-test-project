import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { RegisterUserDto } from '@app/contracts';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  function register(overrides: Partial<RegisterUserDto> = {}) {
    return service.register({
      email: 'jane@example.com',
      name: 'Jane',
      password: 'password123',
      ...overrides,
    });
  }

  describe('register', () => {
    it('creates a user with a generated id and timestamps', async () => {
      const user = await register();

      expect(user).toMatchObject({ email: 'jane@example.com', name: 'Jane' });
      expect(typeof user.id).toBe('string');
      expect(user.createdAt).toBe(user.updatedAt);
      expect(typeof user.createdAt).toBe('string');
    });

    it('never exposes the password hash', async () => {
      const user = await register();

      expect(user).not.toHaveProperty('passwordHash');
    });

    it('normalizes the email to lower case', async () => {
      const user = await register({ email: 'Jane@Example.COM' });

      expect(user.email).toBe('jane@example.com');
    });

    it('throws ConflictException when the email is already registered', async () => {
      await register();

      await expect(register({ email: 'JANE@example.com' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    it('returns the public user for valid credentials', async () => {
      const registered = await register();

      const user = await service.login({
        email: 'jane@example.com',
        password: 'password123',
      });

      expect(user.id).toBe(registered.id);
      expect(user).not.toHaveProperty('passwordHash');
    });

    it('accepts credentials regardless of email casing', async () => {
      const registered = await register();

      const user = await service.login({
        email: 'JANE@EXAMPLE.COM',
        password: 'password123',
      });

      expect(user.id).toBe(registered.id);
    });

    it('throws UnauthorizedException for an unknown email', async () => {
      await expect(
        service.login({ email: 'missing@example.com', password: 'whatever' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for a wrong password', async () => {
      await register();

      await expect(
        service.login({
          email: 'jane@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
