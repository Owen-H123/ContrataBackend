import { MigrationInterface, QueryRunner } from 'typeorm';

export class ObservacionTrabajador1795497167616 implements MigrationInterface {
  name = 'ObservacionTrabajador1795497167616';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "trabajadores" ADD "observacion" character varying(300)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "trabajadores" DROP COLUMN "observacion"`,
    );
  }
}
