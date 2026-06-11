import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class InitCart1781193212476 implements MigrationInterface {
  name = 'InitCart1781193212476';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "carts" ("userId" character varying NOT NULL, "items" jsonb NOT NULL DEFAULT '[]', "total" numeric(12,2) NOT NULL DEFAULT '0', "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_69828a178f152f157dcf2f70a89" PRIMARY KEY ("userId"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "carts"`);
  }
}
