import { MigrationInterface, QueryRunner } from 'typeorm';

export class ObservacionTrabajo1795576928327 implements MigrationInterface {
  name = 'ObservacionTrabajo1795576928327';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "trabajos" ADD "observacion" character varying(300)`,
    );
    await queryRunner.query(
      `ALTER TABLE "trabajos" ADD "importado_de" character varying(120)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_19ba7a1b1f5a6249f0d425b4a5" ON "trabajos"  ("importado_de") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_19ba7a1b1f5a6249f0d425b4a5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trabajos" DROP COLUMN "importado_de"`,
    );
    await queryRunner.query(`ALTER TABLE "trabajos" DROP COLUMN "observacion"`);
  }
}
