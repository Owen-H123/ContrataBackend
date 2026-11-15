import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrdenesCompra1794719797501 implements MigrationInterface {
  name = 'OrdenesCompra1794719797501';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."ordenes_compra_estado_enum" AS ENUM('ABIERTA', 'CERRADA', 'ANULADA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ordenes_compra" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "numero" character varying(20) NOT NULL, "cliente_id" uuid NOT NULL, "fecha_emision" date NOT NULL, "moneda" character varying(3) NOT NULL DEFAULT 'PEN', "estado" "public"."ordenes_compra_estado_enum" NOT NULL DEFAULT 'ABIERTA', "observaciones" character varying(500), CONSTRAINT "UQ_63cd51691dde1d516b1fb91d375" UNIQUE ("cliente_id", "numero"), CONSTRAINT "PK_4c80d543ff8c43dd99551a12d35" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."items_orden_etapas_enum" AS ENUM('ANTES', 'PROCESO', 'DESPUES')`,
    );
    await queryRunner.query(
      `CREATE TABLE "items_orden" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "orden_id" uuid NOT NULL, "posicion" integer NOT NULL, "sitio_id" uuid NOT NULL, "codigo_material" character varying(20), "descripcion" character varying(300) NOT NULL, "detalle" character varying(500), "cantidad" numeric(12,3) NOT NULL, "unidad" character varying(10) NOT NULL, "precio_unitario" numeric(12,2) NOT NULL, "fecha_entrega" date, "etapas" "public"."items_orden_etapas_enum" array NOT NULL, CONSTRAINT "UQ_38c23f704a726306889c679085c" UNIQUE ("orden_id", "posicion"), CONSTRAINT "PK_ad7ecae0cec4bd73b1ab4396352" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4754976042190e9811bc2a3460" ON "items_orden"  ("sitio_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "ordenes_compra" ADD CONSTRAINT "FK_95164baa5a987820baefef0bbba" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "items_orden" ADD CONSTRAINT "FK_6d462239fd45995bce13bae2f0a" FOREIGN KEY ("orden_id") REFERENCES "ordenes_compra"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "items_orden" ADD CONSTRAINT "FK_4754976042190e9811bc2a34605" FOREIGN KEY ("sitio_id") REFERENCES "sitios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "items_orden" DROP CONSTRAINT "FK_4754976042190e9811bc2a34605"`,
    );
    await queryRunner.query(
      `ALTER TABLE "items_orden" DROP CONSTRAINT "FK_6d462239fd45995bce13bae2f0a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ordenes_compra" DROP CONSTRAINT "FK_95164baa5a987820baefef0bbba"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4754976042190e9811bc2a3460"`,
    );
    await queryRunner.query(`DROP TABLE "items_orden"`);
    await queryRunner.query(`DROP TYPE "public"."items_orden_etapas_enum"`);
    await queryRunner.query(`DROP TABLE "ordenes_compra"`);
    await queryRunner.query(`DROP TYPE "public"."ordenes_compra_estado_enum"`);
  }
}
