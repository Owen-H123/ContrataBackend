import { z } from 'zod';

/**
 * Variables de entorno que la aplicación necesita para arrancar.
 * Si falta alguna o tiene un formato inválido, la aplicación no inicia.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'Debe ser una URL de PostgreSQL'),
  JWT_SECRET: z.string().min(32, 'Debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(43_200),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;
