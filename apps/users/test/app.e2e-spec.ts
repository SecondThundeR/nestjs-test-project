import { type PublicUser, USERS_PATTERNS } from '@app/domains';
import {
  GlobalRpcExceptionFilter,
  rpcValidationExceptionFactory,
} from '@app/filters';
import { type INestMicroservice, ValidationPipe } from '@nestjs/common';
import {
  type ClientProxy,
  ClientProxyFactory,
  type MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';

import { createInMemoryDataSource } from './../../../test/utils/in-memory-database';
import { UserEntity } from './../src/entities/user.entity';
import { UsersModule } from './../src/users.module';

const HOST = '127.0.0.1';
const PORT = 4004;

describe('Users microservice (e2e)', () => {
  let app: INestMicroservice;
  let client: ClientProxy;

  beforeAll(async () => {
    const dataSource = await createInMemoryDataSource([UserEntity]);

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

  it('creates, validates and finds a user over TCP', async () => {
    const created = await send<PublicUser>(USERS_PATTERNS.CREATE, {
      email: 'jane@example.com',
      name: 'Jane',
      password: 'password123',
    });
    expect(created).toMatchObject({
      email: 'jane@example.com',
      name: 'Jane',
    });
    expect(typeof created.id).toBe('string');
    expect(created).not.toHaveProperty('passwordHash');

    const validated = await send<PublicUser>(
      USERS_PATTERNS.VALIDATE_CREDENTIALS,
      { email: 'jane@example.com', password: 'password123' },
    );
    expect(validated.id).toBe(created.id);
    expect(validated).not.toHaveProperty('passwordHash');

    const found = await send<PublicUser>(USERS_PATTERNS.FIND_BY_ID, created.id);
    expect(found.id).toBe(created.id);
    expect(found).not.toHaveProperty('passwordHash');
  });

  it('returns null for an unknown user id', async () => {
    await expect(
      send<PublicUser | null>(USERS_PATTERNS.FIND_BY_ID, 'missing'),
    ).resolves.toBeNull();
  });

  it('rejects creating a duplicate email', async () => {
    await send<PublicUser>(USERS_PATTERNS.CREATE, {
      email: 'dup@example.com',
      name: 'Dup',
      password: 'password123',
    });

    await expect(
      send<PublicUser>(USERS_PATTERNS.CREATE, {
        email: 'dup@example.com',
        name: 'Dup',
        password: 'password123',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects validation with a wrong password', async () => {
    await send<PublicUser>(USERS_PATTERNS.CREATE, {
      email: 'wrong@example.com',
      name: 'Wrong',
      password: 'password123',
    });

    await expect(
      send<PublicUser>(USERS_PATTERNS.VALIDATE_CREDENTIALS, {
        email: 'wrong@example.com',
        password: 'nope',
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects an invalid create payload via the validation pipe', async () => {
    await expect(
      send<PublicUser>(USERS_PATTERNS.CREATE, {
        email: 'not-an-email',
        name: 'x',
        password: 'short',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
