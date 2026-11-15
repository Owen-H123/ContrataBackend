import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Proceso de campo por etapas:
 * - Las etapas de las fotos pasan a ANTES / DURANTE / FINALIZADO (antes PROCESO y DESPUES).
 * - Las fotos generales se dividen en PANORAMICA (torre completa) y ESTACION (equipos).
 *   Las GENERAL que ya existían quedan como PANORAMICA.
 * - Desaparecen el envío, la aprobación y la observación: el informe queda EN_EJECUCION
 *   o FINALIZADO (lo aprueba el cliente en su propio sistema).
 */
export class EtapasDeCampo1794760261925 implements MigrationInterface {
  name = 'EtapasDeCampo1794760261925';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Etapas de las fotos: se renombran los valores y no se pierde ningún dato.
    for (const tipo of ['items_orden_etapas_enum', 'evidencias_etapa_enum']) {
      await queryRunner.query(
        `ALTER TYPE "public"."${tipo}" RENAME VALUE 'PROCESO' TO 'DURANTE'`,
      );
      await queryRunner.query(
        `ALTER TYPE "public"."${tipo}" RENAME VALUE 'DESPUES' TO 'FINALIZADO'`,
      );
    }

    // Tipos de foto.
    await queryRunner.query(
      `ALTER TYPE "public"."evidencias_tipo_enum" RENAME VALUE 'GENERAL' TO 'PANORAMICA'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."evidencias_tipo_enum" ADD VALUE 'ESTACION'`,
    );

    // Estado del informe: ENVIADO y APROBADO → FINALIZADO; OBSERVADO → EN_EJECUCION.
    await queryRunner.query(
      `ALTER TYPE "public"."informes_estado_enum" RENAME TO "informes_estado_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."informes_estado_enum" AS ENUM('EN_EJECUCION', 'FINALIZADO')`,
    );
    await queryRunner.query(
      `ALTER TABLE "informes" ALTER COLUMN "estado" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "informes" ALTER COLUMN "estado" TYPE "public"."informes_estado_enum" USING (CASE "estado"::text WHEN 'ENVIADO' THEN 'FINALIZADO' WHEN 'APROBADO' THEN 'FINALIZADO' ELSE 'EN_EJECUCION' END)::"public"."informes_estado_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "informes" ALTER COLUMN "estado" SET DEFAULT 'EN_EJECUCION'`,
    );
    await queryRunner.query(`DROP TYPE "public"."informes_estado_enum_old"`);

    // Historial: ENVIADO y APROBADO → FINALIZADO; OBSERVADO → REABIERTO.
    await queryRunner.query(
      `ALTER TYPE "public"."revisiones_informe_accion_enum" RENAME TO "revisiones_informe_accion_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."revisiones_informe_accion_enum" AS ENUM('FINALIZADO', 'REABIERTO')`,
    );
    await queryRunner.query(
      `ALTER TABLE "revisiones_informe" ALTER COLUMN "accion" TYPE "public"."revisiones_informe_accion_enum" USING (CASE "accion"::text WHEN 'OBSERVADO' THEN 'REABIERTO' ELSE 'FINALIZADO' END)::"public"."revisiones_informe_accion_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."revisiones_informe_accion_enum_old"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."revisiones_informe_accion_enum" RENAME TO "revisiones_informe_accion_enum_new"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."revisiones_informe_accion_enum" AS ENUM('ENVIADO', 'APROBADO', 'OBSERVADO')`,
    );
    await queryRunner.query(
      `ALTER TABLE "revisiones_informe" ALTER COLUMN "accion" TYPE "public"."revisiones_informe_accion_enum" USING (CASE "accion"::text WHEN 'REABIERTO' THEN 'OBSERVADO' ELSE 'ENVIADO' END)::"public"."revisiones_informe_accion_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."revisiones_informe_accion_enum_new"`,
    );

    await queryRunner.query(
      `ALTER TYPE "public"."informes_estado_enum" RENAME TO "informes_estado_enum_new"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."informes_estado_enum" AS ENUM('EN_EJECUCION', 'ENVIADO', 'OBSERVADO', 'APROBADO')`,
    );
    await queryRunner.query(
      `ALTER TABLE "informes" ALTER COLUMN "estado" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "informes" ALTER COLUMN "estado" TYPE "public"."informes_estado_enum" USING (CASE "estado"::text WHEN 'FINALIZADO' THEN 'ENVIADO' ELSE 'EN_EJECUCION' END)::"public"."informes_estado_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "informes" ALTER COLUMN "estado" SET DEFAULT 'EN_EJECUCION'`,
    );
    await queryRunner.query(`DROP TYPE "public"."informes_estado_enum_new"`);

    // ESTACION no se puede quitar de un enum sin recrearlo: se pasa a PANORAMICA y se recrea.
    await queryRunner.query(
      `ALTER TYPE "public"."evidencias_tipo_enum" RENAME TO "evidencias_tipo_enum_new"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."evidencias_tipo_enum" AS ENUM('ACTIVIDAD', 'EPP', 'GENERAL')`,
    );
    await queryRunner.query(
      `ALTER TABLE "evidencias" ALTER COLUMN "tipo" TYPE "public"."evidencias_tipo_enum" USING (CASE "tipo"::text WHEN 'PANORAMICA' THEN 'GENERAL' WHEN 'ESTACION' THEN 'GENERAL' ELSE "tipo"::text END)::"public"."evidencias_tipo_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."evidencias_tipo_enum_new"`);

    for (const tipo of ['items_orden_etapas_enum', 'evidencias_etapa_enum']) {
      await queryRunner.query(
        `ALTER TYPE "public"."${tipo}" RENAME VALUE 'FINALIZADO' TO 'DESPUES'`,
      );
      await queryRunner.query(
        `ALTER TYPE "public"."${tipo}" RENAME VALUE 'DURANTE' TO 'PROCESO'`,
      );
    }
  }
}
