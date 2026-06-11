import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddOrderPaymentId1781481600000 implements MigrationInterface {
  name = 'AddOrderPaymentId1781481600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "paymentId" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "paymentId"`);
  }
}
