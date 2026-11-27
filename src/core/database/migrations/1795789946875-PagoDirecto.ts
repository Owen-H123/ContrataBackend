import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tipo de solicitud «Pago directo»: se abona y no se rinde. */
export class PagoDirecto1795789946875 implements MigrationInterface {
  name = 'PagoDirecto1795789946875';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."solicitudes_dinero_tipo_enum" ADD VALUE 'PAGO'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Los pagos directos vuelven a reembolso: también se cierran al abonarse.
    await queryRunner.query(
      `UPDATE "solicitudes_dinero" SET "tipo" = 'REEMBOLSO' WHERE "tipo" = 'PAGO'`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitudes_dinero" ALTER COLUMN "tipo" DROP DEFAULT`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."solicitudes_dinero_tipo_enum_old" AS ENUM('ADELANTO', 'REEMBOLSO')`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitudes_dinero" ALTER COLUMN "tipo" TYPE "public"."solicitudes_dinero_tipo_enum_old" USING "tipo"::"text"::"public"."solicitudes_dinero_tipo_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."solicitudes_dinero_tipo_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."solicitudes_dinero_tipo_enum_old" RENAME TO "solicitudes_dinero_tipo_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitudes_dinero" ALTER COLUMN "tipo" SET DEFAULT 'ADELANTO'`,
    );
  }
}
