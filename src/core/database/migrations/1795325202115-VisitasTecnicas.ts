import { MigrationInterface, QueryRunner } from 'typeorm';

export class VisitasTecnicas1795325202115 implements MigrationInterface {
  name = 'VisitasTecnicas1795325202115';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."visitas_tecnicas_estado_enum" AS ENUM('PENDIENTE', 'VISITADO', 'ACCESO_RECHAZADO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "visitas_tecnicas" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "sitio_id" uuid NOT NULL, "tecnico_id" uuid NOT NULL, "fecha" date NOT NULL, "estado" "public"."visitas_tecnicas_estado_enum" NOT NULL DEFAULT 'PENDIENTE', "observaciones" character varying(2000), "latitud" double precision, "longitud" double precision, CONSTRAINT "PK_87469754bb77137b0dcb8dc05c2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9fa636c3ca2f1bde055ed0dce1" ON "visitas_tecnicas"  ("sitio_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_45038161098f5a4aa49bca51e2" ON "visitas_tecnicas"  ("tecnico_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "hallazgos_visita" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "visita_id" uuid NOT NULL, "posicion" integer NOT NULL, "descripcion" character varying(300) NOT NULL, "correctivo" character varying(500), "comentario" character varying(2000), CONSTRAINT "PK_a336e07a68cb412f78bce3c7da3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bd08741ffe9385d96d55398ee2" ON "hallazgos_visita"  ("visita_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."fotos_visita_seccion_enum" AS ENUM('EPP', 'FACHADA', 'CROQUIS', 'HALLAZGO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "fotos_visita" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "visita_id" uuid NOT NULL, "seccion" "public"."fotos_visita_seccion_enum" NOT NULL, "hallazgo_id" uuid, "clave" character varying(300) NOT NULL, "nombre_archivo" character varying(200) NOT NULL, "tipo_contenido" character varying(50) NOT NULL, "bytes" integer, "confirmada" boolean NOT NULL DEFAULT false, "comentario" character varying(500), "tomada_en" TIMESTAMP WITH TIME ZONE, "subido_por_id" uuid NOT NULL, CONSTRAINT "UQ_e9484b1d6594b873aacc5e820f2" UNIQUE ("clave"), CONSTRAINT "PK_fc37f7c1c6e327b984989fa3055" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_630e16c19bdca705650da285d6" ON "fotos_visita"  ("visita_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_685617eda4b7d63e999672f12b" ON "fotos_visita"  ("hallazgo_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."comentarios_visita_estado_enum" AS ENUM('PENDIENTE', 'VISITADO', 'ACCESO_RECHAZADO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "comentarios_visita" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "visita_id" uuid NOT NULL, "texto" character varying(1000), "estado" "public"."comentarios_visita_estado_enum", "autor_id" uuid NOT NULL, CONSTRAINT "PK_60420c18f3af92db3aedefe8acc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c3f635ba60414179d8ec4ec722" ON "comentarios_visita"  ("visita_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "notificaciones" ADD "visita_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notificaciones_tipo_enum" ADD VALUE 'VISITA_ESTADO'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notificaciones_tipo_enum" ADD VALUE 'VISITA_COMENTARIO'`,
    );
    await queryRunner.query(
      `ALTER TABLE "visitas_tecnicas" ADD CONSTRAINT "FK_9fa636c3ca2f1bde055ed0dce1c" FOREIGN KEY ("sitio_id") REFERENCES "sitios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "visitas_tecnicas" ADD CONSTRAINT "FK_45038161098f5a4aa49bca51e2d" FOREIGN KEY ("tecnico_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "hallazgos_visita" ADD CONSTRAINT "FK_bd08741ffe9385d96d55398ee29" FOREIGN KEY ("visita_id") REFERENCES "visitas_tecnicas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "fotos_visita" ADD CONSTRAINT "FK_630e16c19bdca705650da285d6b" FOREIGN KEY ("visita_id") REFERENCES "visitas_tecnicas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "fotos_visita" ADD CONSTRAINT "FK_685617eda4b7d63e999672f12b5" FOREIGN KEY ("hallazgo_id") REFERENCES "hallazgos_visita"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "fotos_visita" ADD CONSTRAINT "FK_2be6e2cfbb515abcfb2337d1347" FOREIGN KEY ("subido_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "comentarios_visita" ADD CONSTRAINT "FK_c3f635ba60414179d8ec4ec7228" FOREIGN KEY ("visita_id") REFERENCES "visitas_tecnicas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "comentarios_visita" ADD CONSTRAINT "FK_e033bb0048257286b7ff2e50404" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "comentarios_visita" DROP CONSTRAINT "FK_e033bb0048257286b7ff2e50404"`,
    );
    await queryRunner.query(
      `ALTER TABLE "comentarios_visita" DROP CONSTRAINT "FK_c3f635ba60414179d8ec4ec7228"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fotos_visita" DROP CONSTRAINT "FK_2be6e2cfbb515abcfb2337d1347"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fotos_visita" DROP CONSTRAINT "FK_685617eda4b7d63e999672f12b5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fotos_visita" DROP CONSTRAINT "FK_630e16c19bdca705650da285d6b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "hallazgos_visita" DROP CONSTRAINT "FK_bd08741ffe9385d96d55398ee29"`,
    );
    await queryRunner.query(
      `ALTER TABLE "visitas_tecnicas" DROP CONSTRAINT "FK_45038161098f5a4aa49bca51e2d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "visitas_tecnicas" DROP CONSTRAINT "FK_9fa636c3ca2f1bde055ed0dce1c"`,
    );
    // Los avisos de visitas usan los tipos nuevos: sin borrarlos, el tipo no se puede volver atrás.
    await queryRunner.query(
      `DELETE FROM "notificaciones" WHERE "tipo"::text LIKE 'VISITA_%'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notificaciones_tipo_enum_old" AS ENUM('INFORME_ASIGNADO', 'INFORME_FINALIZADO', 'INFORME_REABIERTO', 'FOTO_DESCARTADA')`,
    );
    await queryRunner.query(
      `ALTER TABLE "notificaciones" ALTER COLUMN "tipo" TYPE "public"."notificaciones_tipo_enum_old" USING "tipo"::"text"::"public"."notificaciones_tipo_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."notificaciones_tipo_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."notificaciones_tipo_enum_old" RENAME TO "notificaciones_tipo_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notificaciones" DROP COLUMN "visita_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c3f635ba60414179d8ec4ec722"`,
    );
    await queryRunner.query(`DROP TABLE "comentarios_visita"`);
    await queryRunner.query(
      `DROP TYPE "public"."comentarios_visita_estado_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_685617eda4b7d63e999672f12b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_630e16c19bdca705650da285d6"`,
    );
    await queryRunner.query(`DROP TABLE "fotos_visita"`);
    await queryRunner.query(`DROP TYPE "public"."fotos_visita_seccion_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bd08741ffe9385d96d55398ee2"`,
    );
    await queryRunner.query(`DROP TABLE "hallazgos_visita"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_45038161098f5a4aa49bca51e2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9fa636c3ca2f1bde055ed0dce1"`,
    );
    await queryRunner.query(`DROP TABLE "visitas_tecnicas"`);
    await queryRunner.query(
      `DROP TYPE "public"."visitas_tecnicas_estado_enum"`,
    );
  }
}
