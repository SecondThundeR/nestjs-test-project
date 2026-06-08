import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import {
  JWT_CONFIG,
  type JwtPayload,
  type RegisterUserDto,
} from '@app/contracts';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: JWT_CONFIG.secret,
          signOptions: { expiresIn: JWT_CONFIG.expiresIn },
        }),
      ],
      providers: [UsersService],
    }).compile();

    service = moduleRef.get(UsersService);
    jwtService = moduleRef.get(JwtService);
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
      const { user } = await register();

      expect(user).toMatchObject({ email: 'jane@example.com', name: 'Jane' });
      expect(typeof user.id).toBe('string');
      expect(user.createdAt).toBe(user.updatedAt);
      expect(typeof user.createdAt).toBe('string');
    });

    it('never exposes the password hash', async () => {
      const { user } = await register();

      expect(user).not.toHaveProperty('passwordHash');
    });

    it('issues a token carrying the user id and email', async () => {
      const { accessToken, user } = await register();

      const payload = jwtService.verify<JwtPayload>(accessToken);
      expect(payload).toMatchObject({ sub: user.id, email: user.email });
    });

    it('normalizes the email to lower case', async () => {
      const { user } = await register({ email: 'Jane@Example.COM' });

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
    it('returns a token and the public user for valid credentials', async () => {
      const registered = await register();

      const { accessToken, user } = await service.login({
        email: 'jane@example.com',
        password: 'password123',
      });

      expect(user.id).toBe(registered.user.id);
      expect(user).not.toHaveProperty('passwordHash');
      expect(jwtService.verify(accessToken)).toMatchObject({ sub: user.id });
    });

    it('accepts credentials regardless of email casing', async () => {
      const registered = await register();

      const { user } = await service.login({
        email: 'JANE@EXAMPLE.COM',
        password: 'password123',
      });

      expect(user.id).toBe(registered.user.id);
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

  describe('verify', () => {
    it('returns the public user for a valid token', async () => {
      const { accessToken, user } = await register();

      expect(service.verify(accessToken)).toEqual(user);
    });

    it('throws UnauthorizedException for a malformed token', () => {
      expect(() => service.verify('not-a-token')).toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the user no longer exists', () => {
      const token = jwtService.sign({ sub: 'missing', email: 'x@example.com' });

      expect(() => service.verify(token)).toThrow(UnauthorizedException);
    });
  });
});
