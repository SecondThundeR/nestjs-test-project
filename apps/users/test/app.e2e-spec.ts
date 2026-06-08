import { Test } from '@nestjs/testing';
import { type INestMicroservice, ValidationPipe } from '@nestjs/common';
import {
  type ClientProxy,
  ClientProxyFactory,
  type MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  type AuthResult,
  GlobalRpcExceptionFilter,
  type PublicUser,
  rpcValidationExceptionFactory,
  USERS_PATTERNS,
} from '@app/contracts';
import { UsersModule } from './../src/users.module';

const HOST = '127.0.0.1';
const PORT = 4004;

describe('Users microservice (e2e)', () => {
  let app: INestMicroservice;
  let client: ClientProxy;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [UsersModule],
    }).compile();

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
