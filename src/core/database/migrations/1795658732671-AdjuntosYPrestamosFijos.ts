import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdjuntosYPrestamosFijos1795658732671 implements MigrationInterface {
  name = 'AdjuntosYPrestamosFijos1795658732671';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "vouchers_pago_fijo" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "pago_id" uuid NOT NULL, "clave" character varying(300) NOT NULL, "nombre_archivo" character varying(200) NOT NULL, "tipo_contenido" character varying(60) NOT NULL, "bytes" integer, "confirmado" boolean NOT NULL DEFAULT false, "subido_por_id" uuid, CONSTRAINT "PK_6df74a915a737fac961f6f85b6f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9613bd27c126821b38d22109c5" ON "vouchers_pago_fijo"  ("pago_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "archivos_comprobante" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "comprobante_id" uuid NOT NULL, "clave" character varying(300) NOT NULL, "nombre_archivo" character varying(200) NOT NULL, "tipo_contenido" character varying(60) NOT NULL, "bytes" integer, "confirmado" boolean NOT NULL DEFAULT false, "subido_por_id" uuid, CONSTRAINT "PK_a162d1bb4775a25f715a109535e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_44649ac16d4e9913bbadccca32" ON "archivos_comprobante"  ("comprobante_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "pagos_fijos_movimientos" ADD "prestamo_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitudes_dinero" ADD "trabajo_id" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_04ca5ed547c1dd9699ae9b2e45" ON "pagos_fijos_movimientos"  ("prestamo_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4967393a085e967ed9c58bf6e4" ON "solicitudes_dinero"  ("trabajo_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "pagos_fijos_movimientos" ADD CONSTRAINT "FK_04ca5ed547c1dd9699ae9b2e458" FOREIGN KEY ("prestamo_id") REFERENCES "prestamos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vouchers_pago_fijo" ADD CONSTRAINT "FK_9613bd27c126821b38d22109c53" FOREIGN KEY ("pago_id") REFERENCES "pagos_fijos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "archivos_comprobante" ADD CONSTRAINT "FK_44649ac16d4e9913bbadccca321" FOREIGN KEY ("comprobante_id") REFERENCES "comprobantes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitudes_dinero" ADD CONSTRAINT "FK_4967393a085e967ed9c58bf6e4a" FOREIGN KEY ("trabajo_id") REFERENCES "trabajos"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "solicitudes_dinero" DROP CONSTRAINT "FK_4967393a085e967ed9c58bf6e4a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "archivos_comprobante" DROP CONSTRAINT "FK_44649ac16d4e9913bbadccca321"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vouchers_pago_fijo" DROP CONSTRAINT "FK_9613bd27c126821b38d22109c53"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pagos_fijos_movimientos" DROP CONSTRAINT "FK_04ca5ed547c1dd9699ae9b2e458"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4967393a085e967ed9c58bf6e4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_04ca5ed547c1dd9699ae9b2e45"`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitudes_dinero" DROP COLUMN "trabajo_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pagos_fijos_movimientos" DROP COLUMN "prestamo_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_44649ac16d4e9913bbadccca32"`,
    );
    await queryRunner.query(`DROP TABLE "archivos_comprobante"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9613bd27c126821b38d22109c5"`,
    );
    await queryRunner.query(`DROP TABLE "vouchers_pago_fijo"`);
  }
}
