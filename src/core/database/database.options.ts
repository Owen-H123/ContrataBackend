import type { DataSourceOptions } from 'typeorm';
import { entities } from './entities.js';

const migrationsGlob = `${import.meta.dirname.replaceAll('\\', '/')}/migrations/*.js`;

/**
 * Opciones de conexión compartidas por la aplicación y por las migraciones.
 * `synchronize` queda apagado: el esquema solo cambia mediante migraciones.
 */
export function buildDataSourceOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities,
    migrations: [migrationsGlob],
    synchronize: false,
    // Los uuid salen de gen_random_uuid(), que PostgreSQL 13+ trae incluido:
    // no hace falta instalar extensiones ni permisos de superusuario.
    uuidExtension: 'pgcrypto',
    installExtensions: false,
  };
}
