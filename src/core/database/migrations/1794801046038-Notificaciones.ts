import { MigrationInterface, QueryRunner } from "typeorm";

export class Notificaciones1794801046038 implements MigrationInterface {
    name = 'Notificaciones1794801046038'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."notificaciones_tipo_enum" AS ENUM('INFORME_ASIGNADO', 'INFORME_FINALIZADO', 'INFORME_REABIERTO', 'FOTO_DESCARTADA')`);
        await queryRunner.query(`CREATE TABLE "notificaciones" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "usuario_id" uuid NOT NULL, "tipo" "public"."notificaciones_tipo_enum" NOT NULL, "titulo" character varying(160) NOT NULL, "detalle" character varying(400), "informe_id" uuid, "leida_en" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a9d32a419ff58b53a38b5ef85d4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_7448036e0110c9da809af3aaa1" ON "notificaciones"  ("usuario_id", "leida_en", "creado_en") `);
        await queryRunner.query(`ALTER TABLE "notificaciones" ADD CONSTRAINT "FK_2c6341d5bd206ff522b35aa6b69" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notificaciones" DROP CONSTRAINT "FK_2c6341d5bd206ff522b35aa6b69"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7448036e0110c9da809af3aaa1"`);
        await queryRunner.query(`DROP TABLE "notificaciones"`);
        await queryRunner.query(`DROP TYPE "public"."notificaciones_tipo_enum"`);
    }

}
