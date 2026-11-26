import { MigrationInterface, QueryRunner } from 'typeorm';

export class VouchersTareo1795572871538 implements MigrationInterface {
  name = 'VouchersTareo1795572871538';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "vouchers_tareo" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "fila_id" uuid NOT NULL, "clave" character varying(300) NOT NULL, "nombre_archivo" character varying(200) NOT NULL, "tipo_contenido" character varying(60) NOT NULL, "bytes" integer, "confirmado" boolean NOT NULL DEFAULT false, "subido_por_id" uuid, CONSTRAINT "PK_a62fb3a3abfc04405a2b56772f5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_918435a1db2c0d872f2a9c0107" ON "vouchers_tareo"  ("fila_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "vouchers_tareo" ADD CONSTRAINT "FK_918435a1db2c0d872f2a9c01073" FOREIGN KEY ("fila_id") REFERENCES "tareo_filas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "vouchers_tareo" DROP CONSTRAINT "FK_918435a1db2c0d872f2a9c01073"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_918435a1db2c0d872f2a9c0107"`,
    );
    await queryRunner.query(`DROP TABLE "vouchers_tareo"`);
  }
}
