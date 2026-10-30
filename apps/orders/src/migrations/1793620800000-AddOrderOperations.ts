import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderOperations1793620800000 implements MigrationInterface {
  name = 'AddOrderOperations1793620800000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE "order_operations" (
      "id" varchar PRIMARY KEY REFERENCES "orders"("id"),
      "kind" varchar NOT NULL CHECK ("kind" IN ('capture', 'refund', 'release')),
      "nextAttemptAt" timestamptz NOT NULL DEFAULT now(),
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    // Repair cancellations that may have crashed before releasing stock.
    await runner.query(`INSERT INTO "order_operations" ("id", "kind")
      SELECT "id", 'release' FROM "orders" WHERE "status" = 'CANCELLED'`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE "order_operations"');
  }
}
