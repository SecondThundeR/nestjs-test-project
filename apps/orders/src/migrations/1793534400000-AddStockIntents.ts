import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStockIntents1793534400000 implements MigrationInterface {
  name = 'AddStockIntents1793534400000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `CREATE TABLE "stock_intents" ("id" varchar PRIMARY KEY, "createdAt" timestamptz NOT NULL DEFAULT now())`,
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP TABLE "stock_intents"`);
  }
}
