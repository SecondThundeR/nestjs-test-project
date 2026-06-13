import { type MigrationInterface, type QueryRunner } from 'typeorm';

// admin@example.com
// admin12345
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD_HASH =
  '$2b$10$uLegq6f8haFxFVMS8DGvie5k/HwkksGTSBa4mro84R/TpoPeGLdOC';

export class SeedAdminUser1781740800000 implements MigrationInterface {
  name = 'SeedAdminUser1781740800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "users" ("id", "email", "name", "passwordHash", "role")
       VALUES ($1, $2, $3, $4, 'admin')
       ON CONFLICT ("email") DO NOTHING`,
      [ADMIN_ID, ADMIN_EMAIL, 'Administrator', ADMIN_PASSWORD_HASH],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "users" WHERE "id" = $1`, [ADMIN_ID]);
  }
}
