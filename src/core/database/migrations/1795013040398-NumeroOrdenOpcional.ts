import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El número de la orden pasa a ser opcional: algunas órdenes llegan sin número
 * («Orden pendiente») y se completa después al editarla. La regla de no repetir número
 * por cliente se mantiene; Postgres no considera repetidos los NULL.
 */
export class NumeroOrdenOpcional1795013040398 implements MigrationInterface {
  name = 'NumeroOrdenOpcional1795013040398';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ordenes_compra" ALTER COLUMN "numero" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Volver atrás exige que ninguna orden siga sin número.
    await queryRunner.query(
      `ALTER TABLE "ordenes_compra" ALTER COLUMN "numero" SET NOT NULL`,
    );
  }
}
