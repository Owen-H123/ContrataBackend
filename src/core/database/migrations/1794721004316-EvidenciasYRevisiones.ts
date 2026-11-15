import { MigrationInterface, QueryRunner } from 'typeorm';

export class EvidenciasYRevisiones1794721004316 implements MigrationInterface {
  name = 'EvidenciasYRevisiones1794721004316';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."revisiones_informe_accion_enum" AS ENUM('ENVIADO', 'APROBADO', 'OBSERVADO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "revisiones_informe" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "informe_id" uuid NOT NULL, "accion" "public"."revisiones_informe_accion_enum" NOT NULL, "comentario" character varying(1000), "usuario_id" uuid NOT NULL, CONSTRAINT "PK_c7f80413a3711b24e7df9462ad3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bd2f1db36554b0bb5ac38df0d8" ON "revisiones_informe"  ("informe_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."evidencias_tipo_enum" AS ENUM('ACTIVIDAD', 'EPP', 'GENERAL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."evidencias_etapa_enum" AS ENUM('ANTES', 'PROCESO', 'DESPUES')`,
    );
    await queryRunner.query(
      `CREATE TABLE "evidencias" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "informe_id" uuid NOT NULL, "tipo" "public"."evidencias_tipo_enum" NOT NULL, "item_id" uuid, "etapa" "public"."evidencias_etapa_enum", "tecnico_id" uuid, "clave" character varying(300) NOT NULL, "nombre_archivo" character varying(200) NOT NULL, "tipo_contenido" character varying(50) NOT NULL, "bytes" integer, "confirmada" boolean NOT NULL DEFAULT false, "comentario" character varying(500), "tomada_en" TIMESTAMP WITH TIME ZONE, "subido_por_id" uuid NOT NULL, "oculta_en" TIMESTAMP WITH TIME ZONE, "oculta_por_id" uuid, CONSTRAINT "UQ_d0d4910ccc078d3e92c23b21fbb" UNIQUE ("clave"), CONSTRAINT "PK_c2e2ff397deaf434b623ed20507" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_444fb0d2891754d9ff0037cbf1" ON "evidencias"  ("informe_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3d08cee4784af6c9f73d6022b6" ON "evidencias"  ("item_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "revisiones_informe" ADD CONSTRAINT "FK_bd2f1db36554b0bb5ac38df0d8a" FOREIGN KEY ("informe_id") REFERENCES "informes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "revisiones_informe" ADD CONSTRAINT "FK_8b8987815e7823392311585543e" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "evidencias" ADD CONSTRAINT "FK_444fb0d2891754d9ff0037cbf17" FOREIGN KEY ("informe_id") REFERENCES "informes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "evidencias" ADD CONSTRAINT "FK_3d08cee4784af6c9f73d6022b69" FOREIGN KEY ("item_id") REFERENCES "items_orden"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "evidencias" ADD CONSTRAINT "FK_026aa94c9fbfd77bf122832648f" FOREIGN KEY ("tecnico_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "evidencias" ADD CONSTRAINT "FK_8bc5ed6e42d278a24f4a2a7e0e4" FOREIGN KEY ("subido_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "evidencias" ADD CONSTRAINT "FK_939d84b2132cb06d793eeab01a8" FOREIGN KEY ("oculta_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "evidencias" DROP CONSTRAINT "FK_939d84b2132cb06d793eeab01a8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evidencias" DROP CONSTRAINT "FK_8bc5ed6e42d278a24f4a2a7e0e4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evidencias" DROP CONSTRAINT "FK_026aa94c9fbfd77bf122832648f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evidencias" DROP CONSTRAINT "FK_3d08cee4784af6c9f73d6022b69"`,
    );
    await queryRunner.query(
      `ALTER TABLE "evidencias" DROP CONSTRAINT "FK_444fb0d2891754d9ff0037cbf17"`,
    );
    await queryRunner.query(
      `ALTER TABLE "revisiones_informe" DROP CONSTRAINT "FK_8b8987815e7823392311585543e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "revisiones_informe" DROP CONSTRAINT "FK_bd2f1db36554b0bb5ac38df0d8a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3d08cee4784af6c9f73d6022b6"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_444fb0d2891754d9ff0037cbf1"`,
    );
    await queryRunner.query(`DROP TABLE "evidencias"`);
    await queryRunner.query(`DROP TYPE "public"."evidencias_etapa_enum"`);
    await queryRunner.query(`DROP TYPE "public"."evidencias_tipo_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bd2f1db36554b0bb5ac38df0d8"`,
    );
    await queryRunner.query(`DROP TABLE "revisiones_informe"`);
    await queryRunner.query(
      `DROP TYPE "public"."revisiones_informe_accion_enum"`,
    );
  }
}
