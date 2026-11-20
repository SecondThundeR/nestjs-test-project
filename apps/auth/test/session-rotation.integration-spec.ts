import { CacheService } from '@app/cache';
import { authConfig, SERVICE_NAMES } from '@app/config';
import {
  type JwtPayload,
  type PublicUser,
  UserRole,
  USERS_PATTERNS,
} from '@app/domains';
import { JwtService } from '@nestjs/jwt';
import { RpcException } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { defer, of } from 'rxjs';
import { DataSource } from 'typeorm';
import { createInMemoryCache } from '../../../test/utils/in-memory-cache.js';
import { startTestPostgres } from '../../../test/utils/postgresql.js';
import { AuthService } from '../src/auth.service.js';
import { SessionEntity } from '../src/entities/session.entity.js';
import { authMigrations } from '../src/migrations/index.js';

const user: PublicUser = {
  id: 'buyer',
  email: 'buyer@example.test',
  name: 'Buyer',
  role: UserRole.REGULAR,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('Concurrent session rotation (PostgreSQL)', () => {
  let postgres: Awaited<ReturnType<typeof startTestPostgres>> | undefined;

  beforeAll(async () => {
    postgres = await startTestPostgres('auth_rotation');
  });

  afterAll(async () => {
    await postgres?.stop();
  });

  it('allows exactly one refresh and continues the session with the winning token', async ({
    onTestFinished,
  }) => {
    const config = {
      secret: 'test-jwt-secret',
      expiresIn: '1h',
      refreshTtlMs: 60_000,
    };
    const jwtService = new JwtService({ secret: config.secret });
    let userLookups = 0;
    let releaseLookups!: () => void;
    const lookupsReleased = new Promise<void>((resolve) => {
      releaseLookups = resolve;
    });
    const users = {
      send(pattern: string) {
        if (pattern === USERS_PATTERNS.VALIDATE_CREDENTIALS) return of(user);
        if (pattern === USERS_PATTERNS.FIND_BY_ID) {
          return defer(async () => {
            userLookups++;
            // Auth looks up the user only after reading the old session from PostgreSQL.
            await lookupsReleased;
            return user;
          });
        }
        throw new Error(`Unexpected Users RPC: ${pattern}`);
      },
    };

    async function startAuth(applyMigrations = false) {
      const db = await new DataSource({
        type: 'postgres',
        url: postgres!.getConnectionUri(),
        entities: [SessionEntity],
        migrations: authMigrations,
        synchronize: false,
      }).initialize();
      onTestFinished(() => db.destroy());
      if (applyMigrations) await db.runMigrations();
      const module = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: JwtService, useValue: jwtService },
          { provide: authConfig.KEY, useValue: config },
          { provide: SERVICE_NAMES.USERS, useValue: users },
          { provide: CacheService, useValue: createInMemoryCache().service },
          {
            provide: getRepositoryToken(SessionEntity),
            useValue: db.getRepository(SessionEntity),
          },
        ],
      }).compile();
      onTestFinished(() => module.close());
      return module.get(AuthService);
    }

    const first = await startAuth(true);
    const second = await startAuth();
    const credentials = { email: user.email, password: 'fixture-password' };
    const original = await first.login(credentials);
    const oldToken = { refreshToken: original.refreshToken };
    const refreshes = Promise.allSettled([
      first.refresh(oldToken),
      second.refresh(oldToken),
    ]);
    try {
      await expect.poll(() => userLookups, { timeout: 2_000 }).toBe(2);
    } finally {
      releaseLookups();
      await refreshes;
    }

    const results = await refreshes;
    const winner = results.find((result) => result.status === 'fulfilled');
    const loser = results.find((result) => result.status === 'rejected');
    expect(winner).toBeDefined();
    const rejection: unknown = loser?.reason;
    expect(
      rejection instanceof RpcException && rejection.getError(),
    ).toMatchObject({
      statusCode: 401,
      message: 'Invalid or expired refresh token',
    });

    const { sid } = jwtService.verify<JwtPayload>(original.accessToken);
    expect(winner!.value.refreshToken).not.toBe(original.refreshToken);
    expect(
      jwtService.verify<JwtPayload>(winner!.value.accessToken),
    ).toMatchObject({ sid, sub: user.id });

    await expect(second.refresh(oldToken)).rejects.toThrow(
      'Invalid or expired refresh token',
    );
    const next = await second.refresh({
      refreshToken: winner!.value.refreshToken,
    });
    expect(next.refreshToken).not.toBe(winner!.value.refreshToken);
    expect(jwtService.verify<JwtPayload>(next.accessToken)).toMatchObject({
      sid,
      sub: user.id,
    });
  });
});
