import { MigrationInterface, QueryRunner } from 'typeorm';

export class Prestamos1795573499759 implements MigrationInterface {
  name = 'Prestamos1795573499759';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "prestamos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "trabajador_id" uuid NOT NULL, "fecha" date NOT NULL, "monto" numeric(10,2) NOT NULL, "cuota" numeric(10,2) NOT NULL, "nota" character varying(200), "registrado_por_id" uuid, CONSTRAINT "PK_3a2a5a8ed68438a02780b16c5b4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fa207cf9bdba1b6bb827a3f8ff" ON "prestamos"  ("trabajador_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "tareo_movimientos" ADD "prestamo_id" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_aafeb524cf83d76f95f7fdb1fe" ON "tareo_movimientos"  ("prestamo_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "prestamos" ADD CONSTRAINT "FK_fa207cf9bdba1b6bb827a3f8ffa" FOREIGN KEY ("trabajador_id") REFERENCES "trabajadores"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tareo_movimientos" ADD CONSTRAINT "FK_aafeb524cf83d76f95f7fdb1feb" FOREIGN KEY ("prestamo_id") REFERENCES "prestamos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tareo_movimientos" DROP CONSTRAINT "FK_aafeb524cf83d76f95f7fdb1feb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "prestamos" DROP CONSTRAINT "FK_fa207cf9bdba1b6bb827a3f8ffa"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_aafeb524cf83d76f95f7fdb1fe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tareo_movimientos" DROP COLUMN "prestamo_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fa207cf9bdba1b6bb827a3f8ff"`,
    );
    await queryRunner.query(`DROP TABLE "prestamos"`);
  }
}
