import { MigrationInterface, QueryRunner } from 'typeorm';

export class SueldosFijos1795574807509 implements MigrationInterface {
  name = 'SueldosFijos1795574807509';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "pagos_fijos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "trabajador_id" uuid NOT NULL, "mes" character varying(7) NOT NULL, "parte" smallint NOT NULL, "sueldo" numeric(10,2) NOT NULL, "retenido" boolean NOT NULL DEFAULT false, "comentario" text, "pagado_en" date, "medio_pago" "public"."tareo_filas_medio_pago_enum", "operacion" character varying(60), CONSTRAINT "uq_pago_fijo_periodo" UNIQUE ("trabajador_id", "mes", "parte"), CONSTRAINT "PK_ef5fcb54692aedc25988fbfe737" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eeee64bf75aaf4f5625bfb0a81" ON "pagos_fijos"  ("trabajador_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0767090f0168450549eec19eff" ON "pagos_fijos"  ("mes") `,
    );
    await queryRunner.query(
      `CREATE TABLE "pagos_fijos_movimientos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "pago_id" uuid NOT NULL, "tipo" "public"."tareo_movimientos_tipo_enum" NOT NULL, "concepto" "public"."tareo_movimientos_concepto_enum" NOT NULL, "monto" numeric(10,2) NOT NULL, "fecha" date, "nota" character varying(200), CONSTRAINT "PK_4ff83b6f80d5673097fd26ff925" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3b8498a945ff28cd1d7123151d" ON "pagos_fijos_movimientos"  ("pago_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "pagos_fijos" ADD CONSTRAINT "FK_eeee64bf75aaf4f5625bfb0a813" FOREIGN KEY ("trabajador_id") REFERENCES "trabajadores"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pagos_fijos_movimientos" ADD CONSTRAINT "FK_3b8498a945ff28cd1d7123151dd" FOREIGN KEY ("pago_id") REFERENCES "pagos_fijos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pagos_fijos_movimientos" DROP CONSTRAINT "FK_3b8498a945ff28cd1d7123151dd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pagos_fijos" DROP CONSTRAINT "FK_eeee64bf75aaf4f5625bfb0a813"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3b8498a945ff28cd1d7123151d"`,
    );
    await queryRunner.query(`DROP TABLE "pagos_fijos_movimientos"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0767090f0168450549eec19eff"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_eeee64bf75aaf4f5625bfb0a81"`,
    );
    await queryRunner.query(`DROP TABLE "pagos_fijos"`);
  }
}
