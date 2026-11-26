import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeguimientoTrabajos1795576036671 implements MigrationInterface {
  name = 'SeguimientoTrabajos1795576036671';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "revisiones_presupuesto" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "trabajo_id" uuid NOT NULL, "monto" numeric(12,2) NOT NULL, "fecha" date NOT NULL, "nota" character varying(300), CONSTRAINT "PK_d4e453ae30cd397625b2ece5424" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9f9184645021206f0f48dbcc7f" ON "revisiones_presupuesto"  ("trabajo_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."trabajos_area_enum" AS ENUM('CORRECTIVO', 'PREVENTIVO', 'ACCESO', 'INGENIERIA', 'FACTIBILIDAD', 'OTRO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."trabajos_criticidad_enum" AS ENUM('CRITICO', 'NO_CRITICO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."trabajos_etapa_enum" AS ENUM('SOLICITADO', 'ENVIADO', 'REVISADO', 'APROBADO', 'CON_OC', 'EN_EJECUCION', 'EJECUTADO', 'ACTA', 'FACTURADO', 'COBRADO', 'CANCELADO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."trabajos_cancelado_enum" AS ENUM('ANULADO', 'RECHAZADO', 'NO_APLICA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "trabajos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "numero" SERIAL NOT NULL, "cliente_id" uuid NOT NULL, "sitio_id" uuid NOT NULL, "descripcion" character varying(500) NOT NULL, "area" "public"."trabajos_area_enum" NOT NULL DEFAULT 'CORRECTIVO', "criticidad" "public"."trabajos_criticidad_enum", "encargado" character varying(60), "monto" numeric(12,2), "etapa" "public"."trabajos_etapa_enum" NOT NULL DEFAULT 'SOLICITADO', "solicitado_en" date NOT NULL, "enviado_en" date, "revisado_en" date, "aprobado_en" date, "aprobado_por" character varying(60), "orden_id" uuid, "oc_numero" character varying(20), "oc_en" date, "ejecucion_inicio" date, "ejecutado_en" date, "ea_responsable" character varying(60), "ea_solicitada_en" date, "ea_aprobada_en" date, "factura_numero" character varying(20), "facturado_en" date, "monto_facturado" numeric(12,2), "cobrado_en" date, "monto_cobrado" numeric(12,2), "cancelado" "public"."trabajos_cancelado_enum", "cancelado_en" date, "comentario" text, CONSTRAINT "UQ_df8d1400cb5c5da986811d82c8d" UNIQUE ("numero"), CONSTRAINT "PK_f6e8d17fbcb1d72fb45642e3a57" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_14b883832a7729bda1586e6af2" ON "trabajos"  ("cliente_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ce3fa8a5e63e193de6b0a26134" ON "trabajos"  ("sitio_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ab6efe483f0f2796a14b372912" ON "trabajos"  ("area") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e4ef1795d6361b54d976b01100" ON "trabajos"  ("etapa") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_426b04224a2ea9c6b846b0d1b7" ON "trabajos"  ("solicitado_en") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9ac8b987ddeb17e006e5d08bae" ON "trabajos"  ("orden_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "eventos_trabajo" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "trabajo_id" uuid NOT NULL, "tipo" character varying(30) NOT NULL, "texto" character varying(500) NOT NULL, "usuario_id" uuid, "usuario_nombre" character varying(120), CONSTRAINT "PK_0690afe6f9b643242fba07abbbc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4691162c21c2862d19fb532f8c" ON "eventos_trabajo"  ("trabajo_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "revisiones_presupuesto" ADD CONSTRAINT "FK_9f9184645021206f0f48dbcc7fc" FOREIGN KEY ("trabajo_id") REFERENCES "trabajos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trabajos" ADD CONSTRAINT "FK_14b883832a7729bda1586e6af23" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trabajos" ADD CONSTRAINT "FK_ce3fa8a5e63e193de6b0a261347" FOREIGN KEY ("sitio_id") REFERENCES "sitios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trabajos" ADD CONSTRAINT "FK_9ac8b987ddeb17e006e5d08bae3" FOREIGN KEY ("orden_id") REFERENCES "ordenes_compra"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "eventos_trabajo" ADD CONSTRAINT "FK_4691162c21c2862d19fb532f8c3" FOREIGN KEY ("trabajo_id") REFERENCES "trabajos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "eventos_trabajo" DROP CONSTRAINT "FK_4691162c21c2862d19fb532f8c3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trabajos" DROP CONSTRAINT "FK_9ac8b987ddeb17e006e5d08bae3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trabajos" DROP CONSTRAINT "FK_ce3fa8a5e63e193de6b0a261347"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trabajos" DROP CONSTRAINT "FK_14b883832a7729bda1586e6af23"`,
    );
    await queryRunner.query(
      `ALTER TABLE "revisiones_presupuesto" DROP CONSTRAINT "FK_9f9184645021206f0f48dbcc7fc"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4691162c21c2862d19fb532f8c"`,
    );
    await queryRunner.query(`DROP TABLE "eventos_trabajo"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9ac8b987ddeb17e006e5d08bae"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_426b04224a2ea9c6b846b0d1b7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e4ef1795d6361b54d976b01100"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ab6efe483f0f2796a14b372912"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ce3fa8a5e63e193de6b0a26134"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_14b883832a7729bda1586e6af2"`,
    );
    await queryRunner.query(`DROP TABLE "trabajos"`);
    await queryRunner.query(`DROP TYPE "public"."trabajos_cancelado_enum"`);
    await queryRunner.query(`DROP TYPE "public"."trabajos_etapa_enum"`);
    await queryRunner.query(`DROP TYPE "public"."trabajos_criticidad_enum"`);
    await queryRunner.query(`DROP TYPE "public"."trabajos_area_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9f9184645021206f0f48dbcc7f"`,
    );
    await queryRunner.query(`DROP TABLE "revisiones_presupuesto"`);
  }
}
