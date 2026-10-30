import { compare, hash } from 'bcrypt';
import type { DataSource } from 'typeorm';

import { createInMemoryDataSource } from '../../../../test/utils/in-memory-database.js';
import { UserRole } from '../../../../libs/domains/src/index.js';
import { UserEntity } from '../entities/user.entity.js';
import { SeedAdminUser1781740800000 } from '../migrations/1781740800000-SeedAdminUser.js';
import { RemoveDefaultAdmin1793361600000 } from '../migrations/1793361600000-RemoveDefaultAdmin.js';
import { adminCredentialsSchema, createAdmin } from './create-admin.js';

describe('Administrator provisioning', () => {
  let db: DataSource;
  const credentials = {
    email: 'Owner@example.com',
    name: 'Owner',
    password: 'a-long-unique-password',
  };

  beforeEach(async () => {
    db = await createInMemoryDataSource([UserEntity]);
  });
  afterEach(async () => {
    await db.destroy();
  });

  it('creates an admin with a normalized email and hashed password', async () => {
    const users = db.getRepository(UserEntity);
    await createAdmin(users, credentials);
    const user = await users.findOneByOrFail({ email: 'owner@example.com' });
    expect(user.role).toBe(UserRole.ADMIN);
    expect(user.passwordHash).not.toBe(credentials.password);
    expect(await compare(credentials.password, user.passwordHash)).toBe(true);
  });

  it('does not promote or overwrite an existing account', async () => {
    const users = db.getRepository(UserEntity);
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

  it('rejects short passwords and passwords exceeding the bcrypt byte limit', () => {
    for (const password of ['short', 'я'.repeat(37)]) {
      expect(
        adminCredentialsSchema.safeParse({ ...credentials, password }).success,
      ).toBe(false);
    }
  });

  it('does not seed an account or restore one on rollback', async () => {
    const seed = new SeedAdminUser1781740800000();
    await seed.up();
    await seed.down();
    await new RemoveDefaultAdmin1793361600000().down();
    expect(await db.getRepository(UserEntity).count()).toBe(0);
  });

  it('removes only the unchanged legacy account', async () => {
    const users = db.getRepository(UserEntity);
    const migration = new RemoveDefaultAdmin1793361600000();
    const runner = db.createQueryRunner();
    const legacy = {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'admin@example.com',
      name: 'Administrator',
      role: UserRole.ADMIN,
    };
    await users.insert({
      ...legacy,
      passwordHash: await hash(credentials.password, 4),
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
