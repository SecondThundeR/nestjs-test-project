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
  GlobalRpcExceptionFilter,
  type PublicUser,
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
      new ValidationPipe({ whitelist: true, transform: true }),
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

  it('registers a user and logs in over TCP', async () => {
    const registered = await send<PublicUser>(USERS_PATTERNS.REGISTER, {
      email: 'jane@example.com',
      name: 'Jane',
      password: 'password123',
    });
    expect(registered).toMatchObject({
      email: 'jane@example.com',
      name: 'Jane',
    });
    expect(typeof registered.id).toBe('string');
    expect(registered).not.toHaveProperty('passwordHash');

    const loggedIn = await send<PublicUser>(USERS_PATTERNS.LOGIN, {
      email: 'jane@example.com',
      password: 'password123',
    });
    expect(loggedIn.id).toBe(registered.id);
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
    ).rejects.toMatchObject({ status: 'error' });
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
    ).rejects.toMatchObject({ status: 'error' });
  });

  it('rejects an invalid register payload via the validation pipe', async () => {
    await expect(
      send<PublicUser>(USERS_PATTERNS.REGISTER, {
        email: 'not-an-email',
        name: 'x',
        password: 'short',
      }),
    ).rejects.toMatchObject({ status: 'error' });
  });
});
