import { type MigrationInterface } from 'typeorm';

export class SeedAdminUser1781740800000 implements MigrationInterface {
  name = 'SeedAdminUser1781740800000';

  // Retain the migration identity for databases that already applied it.
  public async up(): Promise<void> {}

  public async down(): Promise<void> {}
}
