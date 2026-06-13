import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddUserRole1781654400000 implements MigrationInterface {
  name = 'AddUserRole1781654400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "role" character varying NOT NULL DEFAULT 'regular'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
  }
}
