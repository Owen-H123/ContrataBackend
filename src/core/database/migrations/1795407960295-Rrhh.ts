import { MigrationInterface, QueryRunner } from 'typeorm';

export class Rrhh1795407960295 implements MigrationInterface {
  name = 'Rrhh1795407960295';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."trabajadores_tipo_enum" AS ENUM('JORNAL', 'FIJO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."trabajadores_periodicidad_enum" AS ENUM('QUINCENAL', 'MENSUAL')`,
    );
    await queryRunner.query(
      `CREATE TABLE "trabajadores" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "nombres" character varying(160) NOT NULL, "dni" character varying(12), "cargo" character varying(60) NOT NULL, "tipo" "public"."trabajadores_tipo_enum" NOT NULL DEFAULT 'JORNAL', "pago_dia" numeric(10,2), "sueldo" numeric(10,2), "periodicidad" "public"."trabajadores_periodicidad_enum", "telefono" character varying(20), "banco" character varying(40), "cuenta" character varying(40), "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_69a71ab225a92fa173ca8490fe3" UNIQUE ("dni"), CONSTRAINT "PK_572c7e550b3d755a9826d4a5daa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tareo_movimientos_tipo_enum" AS ENUM('ABONO', 'DESCUENTO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tareo_movimientos_concepto_enum" AS ENUM('ALMUERZO', 'MOVILIDAD', 'BONO', 'ADELANTO', 'PRESTAMO', 'OTRO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "tareo_movimientos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "fila_id" uuid NOT NULL, "tipo" "public"."tareo_movimientos_tipo_enum" NOT NULL, "concepto" "public"."tareo_movimientos_concepto_enum" NOT NULL, "monto" numeric(10,2) NOT NULL, "nota" character varying(200), CONSTRAINT "PK_2fb15e0bedd2781497ce14f1f94" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2dffa9e28c61bee677ee3f81a8" ON "tareo_movimientos"  ("fila_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tareo_filas_medio_pago_enum" AS ENUM('TRANSFERENCIA', 'YAPE_PLIN', 'EFECTIVO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "tareo_filas" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "semana" date NOT NULL, "trabajador_id" uuid NOT NULL, "cargo" character varying(60) NOT NULL, "pago_dia" numeric(10,2) NOT NULL DEFAULT '0', "dias" boolean array NOT NULL DEFAULT '{f,f,f,f,f,f,f}', "retenido" boolean NOT NULL DEFAULT false, "comentario" text, "pagado_en" date, "medio_pago" "public"."tareo_filas_medio_pago_enum", "operacion" character varying(60), CONSTRAINT "uq_tareo_semana_trabajador" UNIQUE ("semana", "trabajador_id"), CONSTRAINT "PK_8e3b2ffa430352b1220b4f95d5d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ebda0b69164373f71d2a735868" ON "tareo_filas"  ("semana") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c0b5940db831418b242f1b57b5" ON "tareo_filas"  ("trabajador_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "tareo_movimientos" ADD CONSTRAINT "FK_2dffa9e28c61bee677ee3f81a8f" FOREIGN KEY ("fila_id") REFERENCES "tareo_filas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tareo_filas" ADD CONSTRAINT "FK_c0b5940db831418b242f1b57b51" FOREIGN KEY ("trabajador_id") REFERENCES "trabajadores"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tareo_filas" DROP CONSTRAINT "FK_c0b5940db831418b242f1b57b51"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tareo_movimientos" DROP CONSTRAINT "FK_2dffa9e28c61bee677ee3f81a8f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c0b5940db831418b242f1b57b5"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ebda0b69164373f71d2a735868"`,
    );
    await queryRunner.query(`DROP TABLE "tareo_filas"`);
    await queryRunner.query(`DROP TYPE "public"."tareo_filas_medio_pago_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2dffa9e28c61bee677ee3f81a8"`,
    );
    await queryRunner.query(`DROP TABLE "tareo_movimientos"`);
    await queryRunner.query(
      `DROP TYPE "public"."tareo_movimientos_concepto_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."tareo_movimientos_tipo_enum"`);
    await queryRunner.query(`DROP TABLE "trabajadores"`);
    await queryRunner.query(
      `DROP TYPE "public"."trabajadores_periodicidad_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."trabajadores_tipo_enum"`);
  }
}
