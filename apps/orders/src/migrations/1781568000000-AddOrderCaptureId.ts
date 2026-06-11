import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddOrderCaptureId1781568000000 implements MigrationInterface {
  name = 'AddOrderCaptureId1781568000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "captureId" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "captureId"`);
  }
}
