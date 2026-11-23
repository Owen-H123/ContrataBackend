import { MigrationInterface, QueryRunner } from 'typeorm';

export class SitioSinCliente1795376384954 implements MigrationInterface {
  name = 'SitioSinCliente1795376384954';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sitios" DROP CONSTRAINT "FK_1b8206e1c6f48695922f9c916b8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sitios" ALTER COLUMN "cliente_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "sitios" ADD CONSTRAINT "FK_1b8206e1c6f48695922f9c916b8" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Volver atrás exige que todos los sitios tengan cliente: si no, se avisa en vez de fallar a medias.
    const [{ total }] = await queryRunner.query(
      `SELECT COUNT(*)::int AS total FROM "sitios" WHERE "cliente_id" IS NULL`,
    );
    if (total > 0) {
      throw new Error(
        `Hay ${total} sitio(s) sin cliente (registrados en visitas técnicas). Asígnales un cliente antes de revertir.`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "sitios" DROP CONSTRAINT "FK_1b8206e1c6f48695922f9c916b8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sitios" ALTER COLUMN "cliente_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "sitios" ADD CONSTRAINT "FK_1b8206e1c6f48695922f9c916b8" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }
}
