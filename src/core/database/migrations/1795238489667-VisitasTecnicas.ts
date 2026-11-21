import { MigrationInterface, QueryRunner } from 'typeorm';

export class VisitasTecnicas1795238489667 implements MigrationInterface {
  name = 'VisitasTecnicas1795238489667';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."visitas_tecnicas_motivo_enum" AS ENUM('INSPECCION', 'LEVANTAMIENTO', 'MANTENIMIENTO_PREVENTIVO', 'MANTENIMIENTO_CORRECTIVO', 'EMERGENCIA', 'OTRO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."visitas_tecnicas_estado_enum" AS ENUM('EN_CURSO', 'FINALIZADA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "visitas_tecnicas" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "orden_id" uuid NOT NULL, "sitio_id" uuid NOT NULL, "tecnico_id" uuid NOT NULL, "fecha" date NOT NULL, "motivo" "public"."visitas_tecnicas_motivo_enum" NOT NULL, "observaciones" character varying(2000), "estado" "public"."visitas_tecnicas_estado_enum" NOT NULL DEFAULT 'EN_CURSO', "latitud" double precision, "longitud" double precision, CONSTRAINT "PK_87469754bb77137b0dcb8dc05c2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_11f06939bfacc4692edf31b1d3" ON "visitas_tecnicas"  ("orden_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9fa636c3ca2f1bde055ed0dce1" ON "visitas_tecnicas"  ("sitio_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_45038161098f5a4aa49bca51e2" ON "visitas_tecnicas"  ("tecnico_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "fotos_visita" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "visita_id" uuid NOT NULL, "clave" character varying(300) NOT NULL, "nombre_archivo" character varying(200) NOT NULL, "tipo_contenido" character varying(50) NOT NULL, "bytes" integer, "confirmada" boolean NOT NULL DEFAULT false, "comentario" character varying(500), "tomada_en" TIMESTAMP WITH TIME ZONE, "subido_por_id" uuid NOT NULL, CONSTRAINT "UQ_e9484b1d6594b873aacc5e820f2" UNIQUE ("clave"), CONSTRAINT "PK_fc37f7c1c6e327b984989fa3055" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_630e16c19bdca705650da285d6" ON "fotos_visita"  ("visita_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."comentarios_visita_tipo_enum" AS ENUM('COMENTARIO', 'FINALIZADA', 'REABIERTA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "comentarios_visita" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "visita_id" uuid NOT NULL, "tipo" "public"."comentarios_visita_tipo_enum" NOT NULL DEFAULT 'COMENTARIO', "texto" character varying(1000), "autor_id" uuid NOT NULL, CONSTRAINT "PK_60420c18f3af92db3aedefe8acc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c3f635ba60414179d8ec4ec722" ON "comentarios_visita"  ("visita_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "notificaciones" ADD "visita_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notificaciones_tipo_enum" ADD VALUE 'VISITA_FINALIZADA'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notificaciones_tipo_enum" ADD VALUE 'VISITA_REABIERTA'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notificaciones_tipo_enum" ADD VALUE 'VISITA_COMENTARIO'`,
    );
    await queryRunner.query(
      `ALTER TABLE "visitas_tecnicas" ADD CONSTRAINT "FK_11f06939bfacc4692edf31b1d3f" FOREIGN KEY ("orden_id") REFERENCES "ordenes_compra"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "visitas_tecnicas" ADD CONSTRAINT "FK_9fa636c3ca2f1bde055ed0dce1c" FOREIGN KEY ("sitio_id") REFERENCES "sitios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "visitas_tecnicas" ADD CONSTRAINT "FK_45038161098f5a4aa49bca51e2d" FOREIGN KEY ("tecnico_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "fotos_visita" ADD CONSTRAINT "FK_630e16c19bdca705650da285d6b" FOREIGN KEY ("visita_id") REFERENCES "visitas_tecnicas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
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
      `ALTER TABLE "fotos_visita" DROP CONSTRAINT "FK_630e16c19bdca705650da285d6b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "visitas_tecnicas" DROP CONSTRAINT "FK_45038161098f5a4aa49bca51e2d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "visitas_tecnicas" DROP CONSTRAINT "FK_9fa636c3ca2f1bde055ed0dce1c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "visitas_tecnicas" DROP CONSTRAINT "FK_11f06939bfacc4692edf31b1d3f"`,
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
      `DROP TYPE "public"."comentarios_visita_tipo_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_630e16c19bdca705650da285d6"`,
    );
    await queryRunner.query(`DROP TABLE "fotos_visita"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_45038161098f5a4aa49bca51e2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9fa636c3ca2f1bde055ed0dce1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_11f06939bfacc4692edf31b1d3"`,
    );
    await queryRunner.query(`DROP TABLE "visitas_tecnicas"`);
    await queryRunner.query(
      `DROP TYPE "public"."visitas_tecnicas_estado_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."visitas_tecnicas_motivo_enum"`,
    );
  }
}
