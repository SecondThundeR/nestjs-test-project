import { DataSource } from 'typeorm';
import authDataSource from '../apps/auth/src/data-source.js';
import ordersDataSource from '../apps/orders/src/data-source.js';
import { AddOrderOperations1793620800000 } from '../apps/orders/src/migrations/1793620800000-AddOrderOperations.js';
import productsDataSource from '../apps/products/src/data-source.js';
import usersDataSource from '../apps/users/src/data-source.js';
import { AddUserRole1781654400000 } from '../apps/users/src/migrations/1781654400000-AddUserRole.js';
import { RemoveDefaultAdmin1793361600000 } from '../apps/users/src/migrations/1793361600000-RemoveDefaultAdmin.js';
import { startTestPostgres } from './utils/postgresql.js';

describe('SQL migrations (PostgreSQL)', () => {
  let postgres: Awaited<ReturnType<typeof startTestPostgres>> | undefined;
  let admin: DataSource;
  let db: DataSource | undefined;

  beforeAll(async () => {
    postgres = await startTestPostgres('migration_tests');
    admin = new DataSource({
      type: 'postgres',
      url: postgres.getConnectionUri(),
    });
    await admin.initialize();
  });

  afterEach(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  afterAll(async () => {
    try {
      if (admin?.isInitialized) await admin.destroy();
    } finally {
      await postgres?.stop();
    }
  });

  async function createDatabase(name: string, source: DataSource) {
    // Names are fixed test fixtures and PostgreSQL scopes schemas to each database.
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(postgres!.getConnectionUri());
    url.pathname = name;
    db = new DataSource({
      type: 'postgres',
      url: url.toString(),
      entities: source.options.entities,
      migrations: source.options.migrations,
      migrationsTableName: source.options.migrationsTableName,
      synchronize: false,
      migrationsRun: false,
    });
    return db;
  }

  async function runMigrations(
    database: DataSource,
    migrations: NonNullable<DataSource['options']['migrations']>,
  ) {
    if (database.isInitialized) await database.destroy();
    database.setOptions({ migrations });
    await database.initialize();
    return database.runMigrations();
  }

  it.each([
    ['auth', authDataSource, ['sessions']],
    [
      'orders',
      ordersDataSource,
      ['order_operations', 'orders', 'stock_intents'],
    ],
    ['products', productsDataSource, ['products', 'stock_reservations']],
    ['users', usersDataSource, ['users']],
  ] as const)(
    'applies the full %s migration chain to an empty database',
    async (name, source, tables) => {
      const database = await createDatabase(name, source);
      await database.initialize();
      const applied = await database.runMigrations();
      expect(applied.length).toBeGreaterThan(0);
      expect(applied.map((migration) => migration.name)).toEqual(
        database.migrations.map((migration) => migration.name),
      );
      const found = await database.query<{ tablename: string }[]>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
      );
      expect(found.map((row) => row.tablename)).toEqual([
        'migrations',
        ...tables,
      ]);
      expect(await database.runMigrations()).toEqual([]);
    },
  );

  it('queues a stock release for pre-existing cancelled orders only', async () => {
    const database = await createDatabase('orders_upgrade', ordersDataSource);
    const migrations = Object.values(ordersDataSource.options.migrations ?? []);
    const index = migrations.indexOf(AddOrderOperations1793620800000);
    expect(index).toBeGreaterThan(0);
    await runMigrations(database, migrations.slice(0, index));
    await database.query(`
      INSERT INTO orders (id, "userId", "shippingAddress", status)
      VALUES ('cancelled-order', 'buyer', 'Address', 'CANCELLED'),
             ('active-order', 'buyer', 'Address', 'PENDING')
    `);
    await runMigrations(database, migrations);

    expect(
      await database.query('SELECT id, status FROM orders ORDER BY id'),
    ).toEqual([
      { id: 'active-order', status: 'PENDING' },
      { id: 'cancelled-order', status: 'CANCELLED' },
    ]);
    expect(
      await database.query('SELECT id, kind FROM order_operations'),
    ).toEqual([{ id: 'cancelled-order', kind: 'release' }]);
  });

  it('assigns the default regular role to an existing user', async () => {
    const database = await createDatabase(
      'users_role_upgrade',
      usersDataSource,
    );
    const migrations = Object.values(usersDataSource.options.migrations ?? []);
    const index = migrations.indexOf(AddUserRole1781654400000);
    expect(index).toBeGreaterThan(0);
    await runMigrations(database, migrations.slice(0, index));
    await database.query(`
      INSERT INTO users (id, email, name, "passwordHash")
      VALUES ('existing-user', 'buyer@example.test', 'Buyer', 'fixture-hash')
    `);
    await runMigrations(database, migrations);
    expect(await database.query('SELECT id, email, role FROM users')).toEqual([
      { id: 'existing-user', email: 'buyer@example.test', role: 'regular' },
    ]);
  });

  it.each([
    ['removes', 'legacy', false],
    ['preserves', 'rotated', true],
  ] as const)(
    '%s the seeded admin with a %s password hash',
    async (_action, hashType, preservesAdmin) => {
      const migrations = Object.values(
        usersDataSource.options.migrations ?? [],
      );
      const index = migrations.indexOf(RemoveDefaultAdmin1793361600000);
      expect(index).toBeGreaterThan(0);
      const defaultAdminId = '00000000-0000-4000-8000-000000000001';
      const defaultAdminEmail = 'admin@example.com';
      const legacyHash =
        '$2b$10$uLegq6f8haFxFVMS8DGvie5k/HwkksGTSBa4mro84R/TpoPeGLdOC';
      const database = await createDatabase(
        `users_admin_${hashType}`,
        usersDataSource,
      );
      await runMigrations(database, migrations.slice(0, index));
      await database.query(
        `
      INSERT INTO users (id, email, name, "passwordHash", role)
      VALUES ($1, $2, 'Seeded admin', $3, 'admin'),
             ('other-admin', 'other@example.test', 'Other admin', 'fixture-hash', 'admin')
    `,
        [
          defaultAdminId,
          defaultAdminEmail,
          preservesAdmin ? 'rotated-fixture-hash' : legacyHash,
        ],
      );
      await runMigrations(database, migrations);
      expect(
        await database.query('SELECT id, role FROM users ORDER BY id'),
      ).toEqual([
        ...(preservesAdmin ? [{ id: defaultAdminId, role: 'admin' }] : []),
        { id: 'other-admin', role: 'admin' },
      ]);
    },
  );
});
