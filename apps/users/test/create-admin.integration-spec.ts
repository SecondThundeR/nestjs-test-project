import { describe, expect, it } from 'vitest';
import { hash, verify } from 'argon2';

import { usePostgresTestDatabase } from '../../../test/utils/postgresql.js';
import source from '../src/data-source.js';
import { UserRole } from '../../../libs/domains/src/index.js';
import { UserEntity } from '../src/entities/user.entity.js';
import { SeedAdminUser1781740800000 } from '../src/migrations/1781740800000-SeedAdminUser.js';
import { RemoveDefaultAdmin1793361600000 } from '../src/migrations/1793361600000-RemoveDefaultAdmin.js';
import { createAdmin } from '../src/scripts/create-admin.js';

describe('Administrator provisioning', () => {
  const database = usePostgresTestDatabase('create_admin', source, ['users']);
  const credentials = {
    email: 'Owner@example.com',
    name: 'Owner',
    password: 'a-long-unique-password',
  };

  it('creates an admin with a normalized email and hashed password', async () => {
    const users = database().getRepository(UserEntity);
    await createAdmin(users, credentials);
    const user = await users.findOneByOrFail({ email: 'owner@example.com' });
    expect(user.role).toBe(UserRole.ADMIN);
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verify(user.passwordHash, credentials.password)).toBe(true);
  });

  it('does not promote or overwrite an existing account', async () => {
    const users = database().getRepository(UserEntity);
    await users.insert({
      id: 'existing',
      email: 'owner@example.com',
      name: 'Existing',
      passwordHash: 'original',
      role: UserRole.REGULAR,
    });
    await expect(createAdmin(users, credentials)).rejects.toThrow(
      'already registered',
    );
    expect(await users.findOneByOrFail({ id: 'existing' })).toMatchObject({
      role: UserRole.REGULAR,
      passwordHash: 'original',
    });
  });

  it('preserves passwords longer than 72 UTF-8 bytes', async () => {
    const password = 'я'.repeat(40);
    const users = database().getRepository(UserEntity);
    await createAdmin(users, { ...credentials, password });
    const user = await users.findOneByOrFail({ email: 'owner@example.com' });
    expect(await verify(user.passwordHash, password)).toBe(true);
    expect(await verify(user.passwordHash, password.slice(0, 36))).toBe(false);
  });

  it('does not seed an account or restore one on rollback', async () => {
    const seed = new SeedAdminUser1781740800000();
    await seed.up();
    await seed.down();
    await new RemoveDefaultAdmin1793361600000().down();
    expect(await database().getRepository(UserEntity).count()).toBe(0);
  });

  it('removes only the unchanged legacy account', async () => {
    const users = database().getRepository(UserEntity);
    const migration = new RemoveDefaultAdmin1793361600000();
    const runner = database().createQueryRunner();
    const legacy = {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'admin@example.com',
      name: 'Administrator',
      role: UserRole.ADMIN,
    };
    await users.insert({
      ...legacy,
      passwordHash: await hash(credentials.password),
    });
    await migration.up(runner);
    expect(await users.count()).toBe(1);
    await users.update(
      { id: legacy.id },
      {
        passwordHash:
          '$2b$10$uLegq6f8haFxFVMS8DGvie5k/HwkksGTSBa4mro84R/TpoPeGLdOC',
      },
    );
    await migration.up(runner);
    await migration.up(runner);
    expect(await users.count()).toBe(0);
    await runner.release();
  });
});
