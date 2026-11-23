import { MigrationInterface, QueryRunner } from 'typeorm';

export class MedidasDelItem1795380886361 implements MigrationInterface {
  name = 'MedidasDelItem1795380886361';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "hallazgos_visita" ADD "con_medidas" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."hallazgos_visita_unidad_enum" AS ENUM('M', 'CM', 'MM')`,
    );
    await queryRunner.query(
      `ALTER TABLE "hallazgos_visita" ADD "unidad" "public"."hallazgos_visita_unidad_enum" NOT NULL DEFAULT 'M'`,
    );
    // Los ítems que ya tienen medidas o fotos con flexómetro quedan como «con medidas».
    await queryRunner.query(
      `UPDATE "hallazgos_visita" h SET "con_medidas" = true WHERE h."largo" IS NOT NULL OR h."ancho" IS NOT NULL OR h."alto" IS NOT NULL OR EXISTS (SELECT 1 FROM "fotos_visita" f WHERE f."hallazgo_id" = h."id" AND f."seccion" = 'MEDIDA')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "hallazgos_visita" DROP COLUMN "unidad"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."hallazgos_visita_unidad_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "hallazgos_visita" DROP COLUMN "con_medidas"`,
    );
  }
}
