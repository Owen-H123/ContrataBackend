import { MigrationInterface, QueryRunner } from 'typeorm';

export class SolicitudesDinero1795494814375 implements MigrationInterface {
  name = 'SolicitudesDinero1795494814375';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."archivos_solicitud_tipo_enum" AS ENUM('SUSTENTO', 'VOUCHER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "archivos_solicitud" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "solicitud_id" uuid NOT NULL, "tipo" "public"."archivos_solicitud_tipo_enum" NOT NULL, "clave" character varying(300) NOT NULL, "nombre_archivo" character varying(200) NOT NULL, "tipo_contenido" character varying(60) NOT NULL, "bytes" integer, "confirmado" boolean NOT NULL DEFAULT false, "monto" numeric(10,2), "subido_por_id" uuid, CONSTRAINT "PK_56126fea38f8858f124f1fb02c3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_70459100d5b0c96eb396a5878c" ON "archivos_solicitud"  ("solicitud_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."solicitudes_dinero_tipo_enum" AS ENUM('ADELANTO', 'REEMBOLSO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."solicitudes_dinero_estado_enum" AS ENUM('PENDIENTE', 'APROBADA', 'RECHAZADA', 'ABONADA', 'RENDIDA')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."solicitudes_dinero_medio_abono_enum" AS ENUM('TRANSFERENCIA', 'YAPE_PLIN', 'EFECTIVO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "solicitudes_dinero" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "numero" SERIAL NOT NULL, "solicitante_id" uuid NOT NULL, "documento" character varying(11) NOT NULL, "beneficiario" character varying(160) NOT NULL, "banco" character varying(40), "cuenta" character varying(40) NOT NULL, "monto" numeric(10,2) NOT NULL, "monto_aprobado" numeric(10,2), "concepto" character varying(300), "tipo" "public"."solicitudes_dinero_tipo_enum" NOT NULL DEFAULT 'ADELANTO', "sitio_id" uuid, "centro_costo" character varying(60), "fecha" date NOT NULL, "estado" "public"."solicitudes_dinero_estado_enum" NOT NULL DEFAULT 'PENDIENTE', "revisado_por_id" uuid, "revisado_en" TIMESTAMP WITH TIME ZONE, "comentario_revision" character varying(500), "abonado_por_id" uuid, "abonado_en" date, "medio_abono" "public"."solicitudes_dinero_medio_abono_enum", "operacion" character varying(60), "rendido_en" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_a3113a3e9767a4d044ff483336a" UNIQUE ("numero"), CONSTRAINT "PK_ff4c184ac389492a6530983e06c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dd2e4a01b9237842c4a40c7fd5" ON "solicitudes_dinero"  ("solicitante_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_13d2e798294e5e9628f89afea7" ON "solicitudes_dinero"  ("sitio_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_73098202c7e45647a90db4f8fc" ON "solicitudes_dinero"  ("fecha") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e6b9aae9acdfe5ed7ed7135498" ON "solicitudes_dinero"  ("estado") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."usuarios_permisos_enum" AS ENUM('PEDIR_DINERO', 'APROBAR_DINERO', 'ABONAR_DINERO')`,
    );
    await queryRunner.query(
      `ALTER TABLE "usuarios" ADD "permisos" "public"."usuarios_permisos_enum" array NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "notificaciones" ADD "solicitud_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notificaciones_tipo_enum" ADD VALUE 'SOLICITUD_NUEVA'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notificaciones_tipo_enum" ADD VALUE 'SOLICITUD_ESTADO'`,
    );
    await queryRunner.query(
      `ALTER TABLE "archivos_solicitud" ADD CONSTRAINT "FK_70459100d5b0c96eb396a5878c3" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_dinero"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "archivos_solicitud" ADD CONSTRAINT "FK_6cd2f72981f3b10843fe0aab2e7" FOREIGN KEY ("subido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitudes_dinero" ADD CONSTRAINT "FK_dd2e4a01b9237842c4a40c7fd5d" FOREIGN KEY ("solicitante_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitudes_dinero" ADD CONSTRAINT "FK_13d2e798294e5e9628f89afea72" FOREIGN KEY ("sitio_id") REFERENCES "sitios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitudes_dinero" ADD CONSTRAINT "FK_630b70204de604ab8e3a5bf38be" FOREIGN KEY ("revisado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitudes_dinero" ADD CONSTRAINT "FK_5d080ddc7d275de16661a9d6d96" FOREIGN KEY ("abonado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Los avisos de solicitudes usan valores que se quitan del enum: se borran primero.
    await queryRunner.query(
      `DELETE FROM "notificaciones" WHERE "tipo"::text LIKE 'SOLICITUD_%'`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitudes_dinero" DROP CONSTRAINT "FK_5d080ddc7d275de16661a9d6d96"`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitudes_dinero" DROP CONSTRAINT "FK_630b70204de604ab8e3a5bf38be"`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitudes_dinero" DROP CONSTRAINT "FK_13d2e798294e5e9628f89afea72"`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitudes_dinero" DROP CONSTRAINT "FK_dd2e4a01b9237842c4a40c7fd5d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "archivos_solicitud" DROP CONSTRAINT "FK_6cd2f72981f3b10843fe0aab2e7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "archivos_solicitud" DROP CONSTRAINT "FK_70459100d5b0c96eb396a5878c3"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notificaciones_tipo_enum_old" AS ENUM('INFORME_ASIGNADO', 'INFORME_FINALIZADO', 'INFORME_REABIERTO', 'FOTO_DESCARTADA', 'VISITA_ESTADO', 'VISITA_COMENTARIO')`,
    );
    await queryRunner.query(
      `ALTER TABLE "notificaciones" ALTER COLUMN "tipo" TYPE "public"."notificaciones_tipo_enum_old" USING "tipo"::"text"::"public"."notificaciones_tipo_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."notificaciones_tipo_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."notificaciones_tipo_enum_old" RENAME TO "notificaciones_tipo_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notificaciones" DROP COLUMN "solicitud_id"`,
    );
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN "permisos"`);
    await queryRunner.query(`DROP TYPE "public"."usuarios_permisos_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e6b9aae9acdfe5ed7ed7135498"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_73098202c7e45647a90db4f8fc"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_13d2e798294e5e9628f89afea7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dd2e4a01b9237842c4a40c7fd5"`,
    );
    await queryRunner.query(`DROP TABLE "solicitudes_dinero"`);
    await queryRunner.query(
      `DROP TYPE "public"."solicitudes_dinero_medio_abono_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."solicitudes_dinero_estado_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."solicitudes_dinero_tipo_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_70459100d5b0c96eb396a5878c"`,
    );
    await queryRunner.query(`DROP TABLE "archivos_solicitud"`);
    await queryRunner.query(
      `DROP TYPE "public"."archivos_solicitud_tipo_enum"`,
    );
  }
}
