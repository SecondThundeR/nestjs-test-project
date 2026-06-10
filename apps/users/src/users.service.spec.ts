import { Test } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { JwtModule, JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { DataSource, Repository } from 'typeorm';
import { type JwtPayload, type RegisterUserDto } from '@app/domains';
import { authConfig } from '@app/config';
import { createInMemoryDataSource } from '../../../test/utils/in-memory-database';
import { UsersService } from './users.service';
import { UserEntity } from './entities/user.entity';
import { SessionEntity } from './entities/session.entity';

describe('UsersService', () => {
  let service: UsersService;
  let jwtService: JwtService;
  let dataSource: DataSource;
  let sessions: Repository<SessionEntity>;

  beforeEach(async () => {
    dataSource = await createInMemoryDataSource([UserEntity, SessionEntity]);
    sessions = dataSource.getRepository(SessionEntity);

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: authConfig().secret,
          signOptions: {
            expiresIn: authConfig().expiresIn as JwtSignOptions['expiresIn'],
          },
        }),
      ],
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(UserEntity),
          useValue: dataSource.getRepository(UserEntity),
        },
        {
          provide: getRepositoryToken(SessionEntity),
          useValue: sessions,
        },
        { provide: authConfig.KEY, useValue: authConfig() },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
    jwtService = moduleRef.get(JwtService);
  });

  afterEach(async () => {
    await dataSource.destroy();
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

    it('issues a token carrying the user id, email and session id', async () => {
      const { accessToken, user } = await register();

      const payload = jwtService.verify<JwtPayload>(accessToken);
      expect(payload).toMatchObject({ sub: user.id, email: user.email });
      expect(typeof payload.sid).toBe('string');
    });

    it('opens a session and returns its refresh token', async () => {
      const { accessToken, refreshToken, user } = await register();

      expect(typeof refreshToken).toBe('string');
      const { sid } = jwtService.verify<JwtPayload>(accessToken);
      const session = await sessions.findOneBy({ id: sid });
      expect(session).toMatchObject({ userId: user.id, revokedAt: null });
      expect(new Date(session!.expiresAt).getTime()).toBeGreaterThan(
        Date.now(),
      );
    });

    it('never stores the refresh token in plain text', async () => {
      const { accessToken, refreshToken } = await register();

      const { sid } = jwtService.verify<JwtPayload>(accessToken);
      const session = await sessions.findOneBy({ id: sid });
      expect(session!.refreshTokenHash).not.toBe(refreshToken);
    });

    it('normalizes the email to lower case', async () => {
      const { user } = await register({ email: 'Jane@Example.COM' });

      expect(user.email).toBe('jane@example.com');
    });

    it('throws RpcException when the email is already registered', async () => {
      await register();

      await expect(register({ email: 'JANE@example.com' })).rejects.toThrow(
        RpcException,
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

    it('opens a separate session for each login', async () => {
      const { user } = await register();

      await service.login({
        email: 'jane@example.com',
        password: 'password123',
      });

      await expect(sessions.countBy({ userId: user.id })).resolves.toBe(2);
    });

    it('accepts credentials regardless of email casing', async () => {
      const registered = await register();

      const { user } = await service.login({
        email: 'JANE@EXAMPLE.COM',
        password: 'password123',
      });

      expect(user.id).toBe(registered.user.id);
    });

    it('throws RpcException for an unknown email', async () => {
      await expect(
        service.login({ email: 'missing@example.com', password: 'whatever' }),
      ).rejects.toThrow(RpcException);
    });

    it('throws RpcException for a wrong password', async () => {
      await register();

      await expect(
        service.login({
          email: 'jane@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toThrow(RpcException);
    });
  });

  describe('verify', () => {
    it('returns the public user for a valid token', async () => {
      const { accessToken, user } = await register();

      await expect(service.verify(accessToken)).resolves.toEqual(user);
    });

    it('throws RpcException for a malformed token', async () => {
      await expect(service.verify('not-a-token')).rejects.toThrow(RpcException);
    });

    it('throws RpcException when the session has been revoked', async () => {
      const { accessToken } = await register();
      const { sid } = jwtService.verify<JwtPayload>(accessToken);

      await service.logout(sid);

      await expect(service.verify(accessToken)).rejects.toThrow(RpcException);
    });

    it('throws RpcException when the token carries an unknown session', async () => {
      const { user } = await register();
      const token = jwtService.sign({
        sub: user.id,
        email: user.email,
        sid: 'missing-session',
      });

      await expect(service.verify(token)).rejects.toThrow(RpcException);
    });

    it('throws RpcException when the user no longer exists', async () => {
      const { accessToken, user } = await register();

      await dataSource.getRepository(UserEntity).delete({ id: user.id });

      await expect(service.verify(accessToken)).rejects.toThrow(RpcException);
    });
  });

  describe('refresh', () => {
    it('issues a new token pair for a valid refresh token', async () => {
      const { refreshToken, user } = await register();

      const refreshed = await service.refresh({ refreshToken });

      expect(refreshed.user.id).toBe(user.id);
      expect(typeof refreshed.refreshToken).toBe('string');
      expect(jwtService.verify(refreshed.accessToken)).toMatchObject({
        sub: user.id,
      });
    });

    it('rotates the refresh token, invalidating the previous one', async () => {
      const { refreshToken } = await register();

      const refreshed = await service.refresh({ refreshToken });

      expect(refreshed.refreshToken).not.toBe(refreshToken);
      await expect(service.refresh({ refreshToken })).rejects.toThrow(
        RpcException,
      );
      await expect(
        service.refresh({ refreshToken: refreshed.refreshToken }),
      ).resolves.toBeDefined();
    });

    it('slides the session expiration forward on refresh', async () => {
      const { accessToken, refreshToken } = await register();
      const { sid } = jwtService.verify<JwtPayload>(accessToken);

      const nearExpiry = new Date(Date.now() + 60_000).toISOString();
      await sessions.update({ id: sid }, { expiresAt: nearExpiry });

      await service.refresh({ refreshToken });

      const session = await sessions.findOneBy({ id: sid });
      expect(new Date(session!.expiresAt).getTime()).toBeGreaterThan(
        new Date(nearExpiry).getTime(),
      );
    });

    it('keeps the same session across refreshes', async () => {
      const { accessToken, refreshToken } = await register();

      const refreshed = await service.refresh({ refreshToken });

      const original = jwtService.verify<JwtPayload>(accessToken);
      const rotated = jwtService.verify<JwtPayload>(refreshed.accessToken);
      expect(rotated.sid).toBe(original.sid);
    });

    it('throws RpcException for an unknown refresh token', async () => {
      await expect(
        service.refresh({ refreshToken: 'unknown-token' }),
      ).rejects.toThrow(RpcException);
    });

    it('throws RpcException for a revoked session', async () => {
      const { accessToken, refreshToken } = await register();
      const { sid } = jwtService.verify<JwtPayload>(accessToken);

      await service.logout(sid);

      await expect(service.refresh({ refreshToken })).rejects.toThrow(
        RpcException,
      );
    });

    it('throws RpcException for an expired session', async () => {
      const { accessToken, refreshToken } = await register();
      const { sid } = jwtService.verify<JwtPayload>(accessToken);

      await sessions.update(
        { id: sid },
        { expiresAt: new Date(Date.now() - 1000).toISOString() },
      );

      await expect(service.refresh({ refreshToken })).rejects.toThrow(
        RpcException,
      );
    });
  });

  describe('cleanupSessions', () => {
    it('deletes expired and revoked sessions, keeping active ones', async () => {
      const active = await register();
      const revoked = await register({ email: 'revoked@example.com' });
      const expired = await register({ email: 'expired@example.com' });

      const revokedSid = jwtService.verify<JwtPayload>(revoked.accessToken).sid;
      await service.logout(revokedSid);

      const expiredSid = jwtService.verify<JwtPayload>(expired.accessToken).sid;
      await sessions.update(
        { id: expiredSid },
        { expiresAt: new Date(Date.now() - 1000).toISOString() },
      );

      await expect(service.cleanupSessions()).resolves.toBe(2);

      const remaining = await sessions.find();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(
        jwtService.verify<JwtPayload>(active.accessToken).sid,
      );
    });

    it('returns 0 when there is nothing to clean up', async () => {
      await register();

      await expect(service.cleanupSessions()).resolves.toBe(0);
    });
  });

  describe('logout', () => {
    it('revokes the session', async () => {
      const { accessToken } = await register();
      const { sid } = jwtService.verify<JwtPayload>(accessToken);

      await expect(service.logout(sid)).resolves.toEqual({ success: true });

      const session = await sessions.findOneBy({ id: sid });
      expect(session!.revokedAt).not.toBeNull();
    });

    it('is idempotent for already revoked or unknown sessions', async () => {
      const { accessToken } = await register();
      const { sid } = jwtService.verify<JwtPayload>(accessToken);

      await service.logout(sid);

      await expect(service.logout(sid)).resolves.toEqual({ success: true });
      await expect(service.logout('missing')).resolves.toEqual({
        success: true,
      });
    });
  });
});
