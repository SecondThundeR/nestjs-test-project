import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveDefaultAdmin1793361600000 implements MigrationInterface {
  name = 'RemoveDefaultAdmin1793361600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "users" WHERE "id" = $1 AND "email" = $2 AND "passwordHash" = $3`,
      [
        '00000000-0000-4000-8000-000000000001',
        'admin@example.com',
        '$2b$10$uLegq6f8haFxFVMS8DGvie5k/HwkksGTSBa4mro84R/TpoPeGLdOC',
      ],
    );
  }

  // A rollback must never restore the compromised credentials.
  public async down(): Promise<void> {}
}
