import { MigrationInterface, QueryRunner } from 'typeorm';

export class Contabilidad1795577807528 implements MigrationInterface {
  name = 'Contabilidad1795577807528';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."pagos_comprobante_medio_enum" AS ENUM('TRANSFERENCIA', 'DEPOSITO', 'EFECTIVO', 'YAPE_PLIN', 'CHEQUE', 'DETRACCION', 'RETENCION', 'OTRO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "pagos_comprobante" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "comprobante_id" uuid NOT NULL, "fecha" date NOT NULL, "monto" numeric(12,2) NOT NULL, "medio" "public"."pagos_comprobante_medio_enum" NOT NULL, "operacion" character varying(60), "nota" character varying(200), "registrado_por_id" uuid, CONSTRAINT "PK_a184f2530adb0ade381a000b2f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3043630fdd48010ca8d1ae03f2" ON "pagos_comprobante"  ("comprobante_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_389b03abe844b490b7fa3c03fe" ON "pagos_comprobante"  ("fecha") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."comprobantes_tipo_enum" AS ENUM('VENTA', 'COMPRA')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."comprobantes_clase_enum" AS ENUM('FACTURA', 'BOLETA', 'RECIBO_HONORARIOS', 'NOTA_CREDITO', 'TICKET', 'OTRO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."comprobantes_categoria_enum" AS ENUM('MATERIALES', 'SERVICIOS', 'TRANSPORTE', 'COMBUSTIBLE', 'ALIMENTACION', 'HOSPEDAJE', 'HERRAMIENTAS', 'ALQUILER', 'OFICINA', 'IMPUESTOS', 'OTROS')`,
    );
    await queryRunner.query(
      `CREATE TABLE "comprobantes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tipo" "public"."comprobantes_tipo_enum" NOT NULL, "clase" "public"."comprobantes_clase_enum" NOT NULL DEFAULT 'FACTURA', "serie" character varying(10) NOT NULL, "numero" character varying(20) NOT NULL, "fecha_emision" date NOT NULL, "fecha_vencimiento" date, "cliente_id" uuid, "contraparte_documento" character varying(11) NOT NULL, "contraparte_nombre" character varying(160) NOT NULL, "moneda" character varying(3) NOT NULL DEFAULT 'PEN', "tipo_cambio" numeric(8,4), "base_imponible" numeric(12,2) NOT NULL DEFAULT '0', "igv" numeric(12,2) NOT NULL DEFAULT '0', "no_gravado" numeric(12,2) NOT NULL DEFAULT '0', "total" numeric(12,2) NOT NULL DEFAULT '0', "categoria" "public"."comprobantes_categoria_enum", "descripcion" character varying(300) NOT NULL, "trabajo_id" uuid, "centro_costo" character varying(80), "anulado" boolean NOT NULL DEFAULT false, "nota" character varying(500), "registrado_por_id" uuid, CONSTRAINT "uq_comprobante" UNIQUE ("tipo", "contraparte_documento", "serie", "numero"), CONSTRAINT "PK_0c3ac75b725717ec0f082ece89b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0360cec681169d5e8af0a39a37" ON "comprobantes"  ("tipo") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cdf5e763ad4fe84f64a4271e4b" ON "comprobantes"  ("fecha_emision") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_52efe547ddd86fa9592a8ab3df" ON "comprobantes"  ("cliente_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fa75e939d105e0b0394f05c9ad" ON "comprobantes"  ("trabajo_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "pagos_comprobante" ADD CONSTRAINT "FK_3043630fdd48010ca8d1ae03f22" FOREIGN KEY ("comprobante_id") REFERENCES "comprobantes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "comprobantes" ADD CONSTRAINT "FK_52efe547ddd86fa9592a8ab3dfe" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "comprobantes" ADD CONSTRAINT "FK_fa75e939d105e0b0394f05c9ad7" FOREIGN KEY ("trabajo_id") REFERENCES "trabajos"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "comprobantes" DROP CONSTRAINT "FK_fa75e939d105e0b0394f05c9ad7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "comprobantes" DROP CONSTRAINT "FK_52efe547ddd86fa9592a8ab3dfe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pagos_comprobante" DROP CONSTRAINT "FK_3043630fdd48010ca8d1ae03f22"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fa75e939d105e0b0394f05c9ad"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_52efe547ddd86fa9592a8ab3df"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cdf5e763ad4fe84f64a4271e4b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0360cec681169d5e8af0a39a37"`,
    );
    await queryRunner.query(`DROP TABLE "comprobantes"`);
    await queryRunner.query(`DROP TYPE "public"."comprobantes_categoria_enum"`);
    await queryRunner.query(`DROP TYPE "public"."comprobantes_clase_enum"`);
    await queryRunner.query(`DROP TYPE "public"."comprobantes_tipo_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_389b03abe844b490b7fa3c03fe"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3043630fdd48010ca8d1ae03f2"`,
    );
    await queryRunner.query(`DROP TABLE "pagos_comprobante"`);
    await queryRunner.query(
      `DROP TYPE "public"."pagos_comprobante_medio_enum"`,
    );
  }
}
