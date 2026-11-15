import { MigrationInterface, QueryRunner } from 'typeorm';

export class Informes1794720202767 implements MigrationInterface {
  name = 'Informes1794720202767';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."informes_estado_enum" AS ENUM('EN_EJECUCION', 'ENVIADO', 'OBSERVADO', 'APROBADO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "informes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "orden_id" uuid NOT NULL, "sitio_id" uuid NOT NULL, "estado" "public"."informes_estado_enum" NOT NULL DEFAULT 'EN_EJECUCION', "latitud" double precision, "longitud" double precision, CONSTRAINT "UQ_a9ca9ac5c29565a9cf0f28ba315" UNIQUE ("orden_id", "sitio_id"), CONSTRAINT "PK_334e8397b700b9e81a66f645b1e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d214fb4d8d56930c594c1d0bb4" ON "informes"  ("sitio_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "informes_tecnicos" ("informe_id" uuid NOT NULL, "usuario_id" uuid NOT NULL, CONSTRAINT "PK_111d1029edfc3924f8923d11c3f" PRIMARY KEY ("informe_id", "usuario_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_95f604e525abc02f8299105cb0" ON "informes_tecnicos"  ("informe_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7637a3d6410c121f90605713e9" ON "informes_tecnicos"  ("usuario_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "informes" ADD CONSTRAINT "FK_ea3fe620a306f27a50dadff4baa" FOREIGN KEY ("orden_id") REFERENCES "ordenes_compra"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "informes" ADD CONSTRAINT "FK_d214fb4d8d56930c594c1d0bb4b" FOREIGN KEY ("sitio_id") REFERENCES "sitios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "informes_tecnicos" ADD CONSTRAINT "FK_95f604e525abc02f8299105cb0f" FOREIGN KEY ("informe_id") REFERENCES "informes"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "informes_tecnicos" ADD CONSTRAINT "FK_7637a3d6410c121f90605713e91" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "informes_tecnicos" DROP CONSTRAINT "FK_7637a3d6410c121f90605713e91"`,
    );
    await queryRunner.query(
      `ALTER TABLE "informes_tecnicos" DROP CONSTRAINT "FK_95f604e525abc02f8299105cb0f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "informes" DROP CONSTRAINT "FK_d214fb4d8d56930c594c1d0bb4b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "informes" DROP CONSTRAINT "FK_ea3fe620a306f27a50dadff4baa"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7637a3d6410c121f90605713e9"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_95f604e525abc02f8299105cb0"`,
    );
    await queryRunner.query(`DROP TABLE "informes_tecnicos"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d214fb4d8d56930c594c1d0bb4"`,
    );
    await queryRunner.query(`DROP TABLE "informes"`);
    await queryRunner.query(`DROP TYPE "public"."informes_estado_enum"`);
  }
}
