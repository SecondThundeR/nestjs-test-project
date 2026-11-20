import type { AddressInfo, Server } from 'node:net';
import { type PublicUser, USERS_PATTERNS } from '@app/domains';
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
import { firstValueFrom } from 'rxjs';

import {
  configureTestPostgres,
  startTestPostgres,
} from '../../../test/utils/postgresql.js';
import {
  configureTestRedis,
  startTestRedis,
} from '../../../test/utils/redis.js';
import { UsersModule } from './../src/users.module.js';

const HOST = '127.0.0.1';

describe('Users microservice (e2e)', () => {
  let postgres: Awaited<ReturnType<typeof startTestPostgres>> | undefined;
  let redis: Awaited<ReturnType<typeof startTestRedis>> | undefined;
  let app: INestMicroservice;
  let client: ClientProxy;

  beforeAll(async () => {
    postgres = await startTestPostgres('users_rpc');
    configureTestPostgres('USERS', postgres);
    redis = await startTestRedis('users-rpc');
    configureTestRedis(redis);

    const moduleFixture = await Test.createTestingModule({
      imports: [UsersModule],
    }).compile();

    app = moduleFixture.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.TCP,
      options: { host: HOST, port: 0 },
    });
    app.useGlobalPipes(
      new StandardSchemaValidationPipe({
        transform: true,
        exceptionFactory: rpcStandardSchemaExceptionFactory,
      }),
    );
    app.useGlobalFilters(new GlobalRpcExceptionFilter());
    await app.listen();
    const { port } = app.unwrap<Server>().address() as AddressInfo;

    client = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: { host: HOST, port },
    });
    await client.connect();
  });

  afterAll(async () => {
    try {
      try {
        await client?.close();
      } finally {
        await app?.close();
      }
    } finally {
      vi.unstubAllEnvs();
      await Promise.all([redis?.container.stop(), postgres?.stop()]);
    }
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
    const key = await redis!.cli('--scan', '--pattern', `*user:${created.id}`);
    expect(key).toBeTruthy();
    expect(JSON.parse(await redis!.cli('GET', key))).toMatchObject({
      value: found,
    });
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
