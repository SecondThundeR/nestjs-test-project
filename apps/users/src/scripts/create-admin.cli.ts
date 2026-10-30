import dataSource from '../data-source.js';
import { UserEntity } from '../entities/user.entity.js';
import { adminCredentialsSchema, createAdmin } from './create-admin.js';

async function main(): Promise<void> {
  const credentials = adminCredentialsSchema.safeParse({
    email: process.env.ADMIN_EMAIL,
    name: process.env.ADMIN_NAME,
    password: process.env.ADMIN_PASSWORD,
  });
  delete process.env.ADMIN_PASSWORD;
  if (!credentials.success) {
    throw new Error(
      'Set ADMIN_EMAIL, ADMIN_NAME (at least 2 characters) and ADMIN_PASSWORD (at least 12 characters, at most 72 UTF-8 bytes)',
    );
  }

  dataSource.setOptions({ synchronize: false, migrationsRun: false });
  try {
    await dataSource.initialize();
    await createAdmin(dataSource.getRepository(UserEntity), credentials.data);
    console.log('Administrator created');
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

main().catch(() => {
  console.error(
    'Administrator creation failed. Check ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD, database connection and applied migrations; the email must be unused.',
  );
  process.exitCode = 1;
});
