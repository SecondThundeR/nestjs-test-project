import { Test } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { JwtModule, JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { DataSource, Repository } from 'typeorm';
import { of, throwError } from 'rxjs';
import { USERS_PATTERNS, type JwtPayload, type PublicUser } from '@app/domains';
import { authConfig, SERVICE_NAMES } from '@app/config';
import { createInMemoryDataSource } from '../../../test/utils/in-memory-database';
import { AuthService } from './auth.service';
import { SessionEntity } from './entities/session.entity';

const USER: PublicUser = {
  id: 'u-1',
  email: 'jane@example.com',
  name: 'Jane',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let dataSource: DataSource;
  let sessions: Repository<SessionEntity>;
  let users: { send: jest.Mock };

  beforeEach(async () => {
    dataSource = await createInMemoryDataSource([SessionEntity]);
    sessions = dataSource.getRepository(SessionEntity);
    users = { send: jest.fn().mockReturnValue(of(USER)) };

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
        AuthService,
        {
          provide: getRepositoryToken(SessionEntity),
          useValue: sessions,
        },
        { provide: SERVICE_NAMES.USERS, useValue: users },
        { provide: authConfig.KEY, useValue: authConfig() },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    jwtService = moduleRef.get(JwtService);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  function register() {
    return service.register({
      email: 'jane@example.com',
      name: 'Jane',
      password: 'password123',
    });
  }

  describe('register', () => {
    it('creates the user through the users service', async () => {
      const { user } = await register();

      expect(user).toEqual(USER);
      expect(users.send).toHaveBeenCalledWith(USERS_PATTERNS.CREATE, {
        email: 'jane@example.com',
        name: 'Jane',
        password: 'password123',
      });
    });

    it('issues a token carrying the user id, email and session id', async () => {
      const { accessToken } = await register();

      const payload = jwtService.verify<JwtPayload>(accessToken);
      expect(payload).toMatchObject({ sub: USER.id, email: USER.email });
      expect(typeof payload.sid).toBe('string');
    });

    it('opens a session and returns its refresh token', async () => {
      const { accessToken, refreshToken } = await register();

      expect(typeof refreshToken).toBe('string');
      const { sid } = jwtService.verify<JwtPayload>(accessToken);
      const session = await sessions.findOneBy({ id: sid });
      expect(session).toMatchObject({ userId: USER.id, revokedAt: null });
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

    it('propagates errors from the users service as RpcException', async () => {
      users.send.mockReturnValue(
        throwError(() => ({
          statusCode: 409,
          message: 'Email jane@example.com is already registered',
          error: 'Conflict',
        })),
      );

      await expect(register()).rejects.toThrow(RpcException);
      await expect(sessions.count()).resolves.toBe(0);
    });
  });

  describe('login', () => {
    it('validates credentials through the users service', async () => {
      const { accessToken, user } = await service.login({
        email: 'jane@example.com',
        password: 'password123',
      });

      expect(user).toEqual(USER);
      expect(users.send).toHaveBeenCalledWith(
        USERS_PATTERNS.VALIDATE_CREDENTIALS,
        { email: 'jane@example.com', password: 'password123' },
      );
      expect(jwtService.verify(accessToken)).toMatchObject({ sub: USER.id });
    });

    it('opens a separate session for each login', async () => {
      await register();
      await service.login({
        email: 'jane@example.com',
        password: 'password123',
      });

      await expect(sessions.countBy({ userId: USER.id })).resolves.toBe(2);
    });

    it('propagates invalid credentials as RpcException', async () => {
      users.send.mockReturnValue(
        throwError(() => ({
          statusCode: 401,
          message: 'Invalid email or password',
          error: 'Unauthorized',
        })),
      );

      await expect(
        service.login({ email: 'jane@example.com', password: 'wrong' }),
      ).rejects.toThrow(RpcException);
    });
  });

  describe('verify', () => {
    it('returns the public user for a valid token', async () => {
      const { accessToken } = await register();

      await expect(service.verify(accessToken)).resolves.toEqual(USER);
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
      await register();
      const token = jwtService.sign({
        sub: USER.id,
        email: USER.email,
        sid: 'missing-session',
      });

      await expect(service.verify(token)).rejects.toThrow(RpcException);
    });

    it('throws RpcException when the user no longer exists', async () => {
      const { accessToken } = await register();

      users.send.mockReturnValue(of(null));

      await expect(service.verify(accessToken)).rejects.toThrow(RpcException);
    });
  });

  describe('refresh', () => {
    it('issues a new token pair for a valid refresh token', async () => {
      const { refreshToken } = await register();

      const refreshed = await service.refresh({ refreshToken });

      expect(refreshed.user).toEqual(USER);
      expect(typeof refreshed.refreshToken).toBe('string');
      expect(jwtService.verify(refreshed.accessToken)).toMatchObject({
        sub: USER.id,
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

    it('throws RpcException when the user no longer exists', async () => {
      const { refreshToken } = await register();

      users.send.mockReturnValue(of(null));

      await expect(service.refresh({ refreshToken })).rejects.toThrow(
        RpcException,
      );
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

  describe('cleanupSessions', () => {
    it('deletes expired and revoked sessions, keeping active ones', async () => {
      const active = await register();
      const revoked = await register();
      const expired = await register();

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
});
