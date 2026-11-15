import { MigrationInterface, QueryRunner } from 'typeorm';

export class Inicial1794628092788 implements MigrationInterface {
  name = 'Inicial1794628092788';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."usuarios_rol_enum" AS ENUM('ADMIN', 'SUPERVISOR', 'TECNICO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "usuarios" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "nombre" character varying(120) NOT NULL, "usuario" character varying(60) NOT NULL, "password_hash" character varying NOT NULL, "rol" "public"."usuarios_rol_enum" NOT NULL DEFAULT 'TECNICO', "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_0790a401b9d234fa921e9aa1777" UNIQUE ("usuario"), CONSTRAINT "PK_d7281c63c176e152e4c531594a8" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "usuarios"`);
    await queryRunner.query(`DROP TYPE "public"."usuarios_rol_enum"`);
  }
}
