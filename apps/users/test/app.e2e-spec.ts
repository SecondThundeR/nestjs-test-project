import { Test } from '@nestjs/testing';
import { type INestMicroservice, ValidationPipe } from '@nestjs/common';
import {
  type ClientProxy,
  ClientProxyFactory,
  type MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';
import { getDataSourceToken } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import {
  GlobalRpcExceptionFilter,
  rpcValidationExceptionFactory,
} from '@app/filters';
import {
  type AuthResult,
  type LogoutResult,
  type PublicUser,
  USERS_PATTERNS,
} from '@app/domains';
import { createInMemoryDataSource } from './../../../test/utils/in-memory-database';
import { UsersModule } from './../src/users.module';
import { UserEntity } from './../src/entities/user.entity';
import { SessionEntity } from './../src/entities/session.entity';

const HOST = '127.0.0.1';
const PORT = 4004;

describe('Users microservice (e2e)', () => {
  let app: INestMicroservice;
  let client: ClientProxy;

  beforeAll(async () => {
    const dataSource = await createInMemoryDataSource([
      UserEntity,
      SessionEntity,
    ]);

    const moduleFixture = await Test.createTestingModule({
      imports: [UsersModule],
    })
      .overrideProvider(getDataSourceToken())
      .useValue(dataSource)
      .compile();

    app = moduleFixture.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.TCP,
      options: { host: HOST, port: PORT },
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: rpcValidationExceptionFactory,
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
    const registered = await send<AuthResult>(USERS_PATTERNS.REGISTER, {
      email: 'jane@example.com',
      name: 'Jane',
      password: 'password123',
    });
    expect(registered.user).toMatchObject({
      email: 'jane@example.com',
      name: 'Jane',
    });
    expect(typeof registered.user.id).toBe('string');
    expect(typeof registered.accessToken).toBe('string');
    expect(typeof registered.refreshToken).toBe('string');
    expect(registered.user).not.toHaveProperty('passwordHash');

    const loggedIn = await send<AuthResult>(USERS_PATTERNS.LOGIN, {
      email: 'jane@example.com',
      password: 'password123',
    });
    expect(loggedIn.user.id).toBe(registered.user.id);

    const verified = await send<PublicUser>(
      USERS_PATTERNS.VERIFY,
      loggedIn.accessToken,
    );
    expect(verified.id).toBe(registered.user.id);
  });

  it('rejects verifying a malformed token', async () => {
    await expect(
      send<PublicUser>(USERS_PATTERNS.VERIFY, 'not-a-token'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects registering a duplicate email', async () => {
    await send<PublicUser>(USERS_PATTERNS.REGISTER, {
      email: 'dup@example.com',
      name: 'Dup',
      password: 'password123',
    });

    await expect(
      send<PublicUser>(USERS_PATTERNS.REGISTER, {
        email: 'dup@example.com',
        name: 'Dup',
        password: 'password123',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects login with a wrong password', async () => {
    await send<PublicUser>(USERS_PATTERNS.REGISTER, {
      email: 'wrong@example.com',
      name: 'Wrong',
      password: 'password123',
    });

    await expect(
      send<PublicUser>(USERS_PATTERNS.LOGIN, {
        email: 'wrong@example.com',
        password: 'nope',
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('refreshes a session with token rotation', async () => {
    const registered = await send<AuthResult>(USERS_PATTERNS.REGISTER, {
      email: 'refresh@example.com',
      name: 'Refresh',
      password: 'password123',
    });

    const refreshed = await send<AuthResult>(USERS_PATTERNS.REFRESH, {
      refreshToken: registered.refreshToken,
    });
    expect(refreshed.user.id).toBe(registered.user.id);
    expect(refreshed.refreshToken).not.toBe(registered.refreshToken);

    await expect(
      send<AuthResult>(USERS_PATTERNS.REFRESH, {
        refreshToken: registered.refreshToken,
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects token verification and refresh after logout', async () => {
    const registered = await send<AuthResult>(USERS_PATTERNS.REGISTER, {
      email: 'logout@example.com',
      name: 'Logout',
      password: 'password123',
    });

    const verified = await send<PublicUser>(
      USERS_PATTERNS.VERIFY,
      registered.accessToken,
    );
    expect(verified.id).toBe(registered.user.id);

    const sessionId = decodeSessionId(registered.accessToken);
    const loggedOut = await send<LogoutResult>(
      USERS_PATTERNS.LOGOUT,
      sessionId,
    );
    expect(loggedOut).toEqual({ success: true });

    await expect(
      send<PublicUser>(USERS_PATTERNS.VERIFY, registered.accessToken),
    ).rejects.toMatchObject({ statusCode: 401 });
    await expect(
      send<AuthResult>(USERS_PATTERNS.REFRESH, {
        refreshToken: registered.refreshToken,
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects an invalid register payload via the validation pipe', async () => {
    await expect(
      send<PublicUser>(USERS_PATTERNS.REGISTER, {
        email: 'not-an-email',
        name: 'x',
        password: 'short',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
