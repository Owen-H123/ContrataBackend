import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClientesYSitios1794719390231 implements MigrationInterface {
  name = 'ClientesYSitios1794719390231';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "clientes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "razon_social" character varying(160) NOT NULL, "ruc" character varying(11) NOT NULL, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_d8747b033a4210f1d835e776c58" UNIQUE ("ruc"), CONSTRAINT "PK_d76bf3571d906e4e86470482c08" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "sitios" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "codigo" character varying(40) NOT NULL, "nombre" character varying(120) NOT NULL, "cliente_id" uuid NOT NULL, "direccion" character varying(200), "latitud" double precision, "longitud" double precision, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_47045379519a19dd29f23f80427" UNIQUE ("codigo"), CONSTRAINT "PK_6b4c32ad38a261449343cccc81d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1b8206e1c6f48695922f9c916b" ON "sitios" ("cliente_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "sitios" ADD CONSTRAINT "FK_1b8206e1c6f48695922f9c916b8" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sitios" DROP CONSTRAINT "FK_1b8206e1c6f48695922f9c916b8"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1b8206e1c6f48695922f9c916b"`,
    );
    await queryRunner.query(`DROP TABLE "sitios"`);
    await queryRunner.query(`DROP TABLE "clientes"`);
  }
}
