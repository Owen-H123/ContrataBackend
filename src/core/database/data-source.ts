import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './database.options.js';

/**
 * Conexión para la línea de comandos de TypeORM (migraciones y datos iniciales).
 * La aplicación no usa este archivo: se conecta desde DatabaseModule.
 */
try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan las variables ya definidas en el entorno.
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Falta DATABASE_URL para conectarse a la base de datos');
}

export default new DataSource(buildDataSourceOptions(databaseUrl));
