import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStockReservations1793448000000 implements MigrationInterface {
  name = 'AddStockReservations1793448000000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `CREATE TABLE "stock_reservations" ("id" varchar PRIMARY KEY, "items" jsonb NOT NULL, "status" varchar NOT NULL)`,
    );
    await runner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "products_stock_nonnegative" CHECK ("stock" >= 0)`,
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "products_stock_nonnegative"`,
    );
    await runner.query(`DROP TABLE "stock_reservations"`);
  }
}
