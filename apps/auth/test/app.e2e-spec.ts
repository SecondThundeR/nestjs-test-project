import { randomUUID } from 'node:crypto';

import { SERVICE_NAMES } from '@app/config';
import {
  AUTH_PATTERNS,
  type AuthResult,
  type LogoutResult,
  type PublicUser,
  UserRole,
  USERS_PATTERNS,
} from '@app/domains';
import {
  GlobalRpcExceptionFilter,
  rpcStandardSchemaExceptionFactory,
} from '@app/filters';
import {
  type INestMicroservice,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import {
  type ClientProxy,
  ClientProxyFactory,
  type MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { firstValueFrom, of, throwError } from 'rxjs';

import { createInMemoryDataSource } from './../../../test/utils/in-memory-database.js';
import { AuthModule } from './../src/auth.module.js';
import { SessionEntity } from './../src/entities/session.entity.js';

const HOST = '127.0.0.1';
const PORT = 4005;

interface StoredUser extends PublicUser {
  password: string;
}

describe('Auth microservice (e2e)', () => {
  let app: INestMicroservice;
  let client: ClientProxy;
  const usersStore = new Map<string, StoredUser>();

  const fakeUsersClient = {
    send: (pattern: string, payload: unknown) => {
      switch (pattern) {
        case USERS_PATTERNS.CREATE: {
          const dto = payload as {
            email: string;
            name: string;
            password: string;
          };
          if (usersStore.has(dto.email)) {
            return throwError(() => ({
              statusCode: 409,
              message: `Email ${dto.email} is already registered`,
              error: 'Conflict',
            }));
          }
          const now = new Date().toISOString();
          const user: StoredUser = {
            id: randomUUID(),
            email: dto.email,
            name: dto.name,
            password: dto.password,
            role: UserRole.REGULAR,
            createdAt: now,
            updatedAt: now,
          };
          usersStore.set(dto.email, user);
          const { password: _password, ...publicUser } = user;
          return of(publicUser);
        }
        case USERS_PATTERNS.VALIDATE_CREDENTIALS: {
          const dto = payload as { email: string; password: string };
          const user = usersStore.get(dto.email);
          if (!user || user.password !== dto.password) {
            return throwError(() => ({
              statusCode: 401,
              message: 'Invalid email or password',
              error: 'Unauthorized',
            }));
          }
          const { password: _password, ...publicUser } = user;
          return of(publicUser);
        }
        case USERS_PATTERNS.FIND_BY_ID: {
          const user = [...usersStore.values()].find(
            (stored) => stored.id === payload,
          );
          if (!user) {
            return of(null);
          }
          const { password: _password, ...publicUser } = user;
          return of(publicUser);
        }
        default:
          return throwError(() => new Error(`Unexpected pattern ${pattern}`));
      }
    },
  };

  beforeAll(async () => {
    const dataSource = await createInMemoryDataSource([SessionEntity]);

    const moduleFixture = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(getDataSourceToken())
      .useValue(dataSource)
      .overrideProvider(SERVICE_NAMES.USERS)
      .useValue(fakeUsersClient)
      .compile();

    app = moduleFixture.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.TCP,
      options: { host: HOST, port: PORT },
    });
    app.useGlobalPipes(
      new StandardSchemaValidationPipe({
        transform: true,
        exceptionFactory: rpcStandardSchemaExceptionFactory,
      }),
    );
    app.useGlobalFilters(new GlobalRpcExceptionFilter());
    await app.listen();

    client = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: { host: HOST, port: PORT },
    });
    await client.connect();
  });

  afterAll(async () => {
    await client.close();
    await app.close();
  });

  function send<T>(pattern: string, payload: unknown): Promise<T> {
    return firstValueFrom(client.send<T>(pattern, payload));
  }

  function decodeSessionId(accessToken: string): string {
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64url').toString(),
    ) as { sid: string };
    return payload.sid;
  }

  it('registers, logs in and verifies a token over TCP', async () => {
    const registered = await send<AuthResult>(AUTH_PATTERNS.REGISTER, {
      email: 'jane@example.com',
      name: 'Jane',
      password: 'password123',
    });
    expect(registered.user).toMatchObject({
      email: 'jane@example.com',
      name: 'Jane',
    });
    expect(typeof registered.accessToken).toBe('string');
    expect(typeof registered.refreshToken).toBe('string');
    expect(registered.user).not.toHaveProperty('password');
    expect(registered.user).not.toHaveProperty('passwordHash');

    const loggedIn = await send<AuthResult>(AUTH_PATTERNS.LOGIN, {
      email: 'jane@example.com',
      password: 'password123',
    });
    expect(loggedIn.user.id).toBe(registered.user.id);

    const verified = await send<PublicUser>(
      AUTH_PATTERNS.VERIFY,
      decodeSessionId(loggedIn.accessToken),
    );
    expect(verified.id).toBe(registered.user.id);
  });

  it('rejects verifying an unknown session', async () => {
    await expect(
      send<PublicUser>(AUTH_PATTERNS.VERIFY, 'missing-session'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('propagates a duplicate email conflict from the users service', async () => {
    await send<AuthResult>(AUTH_PATTERNS.REGISTER, {
      email: 'dup@example.com',
      name: 'Dup',
      password: 'password123',
    });

    await expect(
      send<AuthResult>(AUTH_PATTERNS.REGISTER, {
        email: 'dup@example.com',
        name: 'Dup',
        password: 'password123',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects login with a wrong password', async () => {
    await send<AuthResult>(AUTH_PATTERNS.REGISTER, {
      email: 'wrong@example.com',
      name: 'Wrong',
      password: 'password123',
    });

    await expect(
      send<AuthResult>(AUTH_PATTERNS.LOGIN, {
        email: 'wrong@example.com',
        password: 'nope',
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('refreshes a session with token rotation', async () => {
    const registered = await send<AuthResult>(AUTH_PATTERNS.REGISTER, {
      email: 'refresh@example.com',
      name: 'Refresh',
      password: 'password123',
    });

    const refreshed = await send<AuthResult>(AUTH_PATTERNS.REFRESH, {
      refreshToken: registered.refreshToken,
    });
    expect(refreshed.user.id).toBe(registered.user.id);
    expect(refreshed.refreshToken).not.toBe(registered.refreshToken);

    await expect(
      send<AuthResult>(AUTH_PATTERNS.REFRESH, {
        refreshToken: registered.refreshToken,
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects token verification and refresh after logout', async () => {
    const registered = await send<AuthResult>(AUTH_PATTERNS.REGISTER, {
      email: 'logout@example.com',
      name: 'Logout',
      password: 'password123',
    });

    const sessionId = decodeSessionId(registered.accessToken);
    const loggedOut = await send<LogoutResult>(AUTH_PATTERNS.LOGOUT, sessionId);
    expect(loggedOut).toEqual({ success: true });

    await expect(
      send<PublicUser>(AUTH_PATTERNS.VERIFY, sessionId),
    ).rejects.toMatchObject({ statusCode: 401 });
    await expect(
      send<AuthResult>(AUTH_PATTERNS.REFRESH, {
        refreshToken: registered.refreshToken,
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects an invalid register payload via the validation pipe', async () => {
    await expect(
      send<AuthResult>(AUTH_PATTERNS.REGISTER, {
        email: 'not-an-email',
        name: 'x',
        password: 'short',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
