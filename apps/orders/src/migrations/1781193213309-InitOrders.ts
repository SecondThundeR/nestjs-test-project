import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class InitOrders1781193213309 implements MigrationInterface {
  name = 'InitOrders1781193213309';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("id" character varying NOT NULL, "userId" character varying NOT NULL, "items" jsonb NOT NULL DEFAULT '[]', "total" numeric(12,2) NOT NULL DEFAULT '0', "status" "public"."orders_status_enum" NOT NULL DEFAULT 'PENDING', "shippingAddress" character varying NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
  }
}
