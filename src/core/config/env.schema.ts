import { z } from 'zod';

const opcional = z
  .string()
  .trim()
  .transform((v) => v || undefined)
  .optional();

/** Variables de Cloudflare R2: o están las cuatro o ninguna. */
const R2_VARIABLES = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
] as const;

/**
 * Variables de entorno que la aplicación necesita para arrancar.
 * Si falta alguna o tiene un formato inválido, la aplicación no inicia.
 */
export const envSchema = z
  .object({
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

    // Fotos en Cloudflare R2. Sin ellas la API arranca, pero no acepta fotos.
    R2_ACCOUNT_ID: opcional,
    R2_ACCESS_KEY_ID: opcional,
    R2_SECRET_ACCESS_KEY: opcional,
    R2_BUCKET: opcional,
  })
  .superRefine((env, ctx) => {
    const definidas = R2_VARIABLES.filter((nombre) => env[nombre]);
    if (definidas.length > 0 && definidas.length < R2_VARIABLES.length) {
      for (const nombre of R2_VARIABLES.filter((n) => !env[n])) {
        ctx.addIssue({
          code: 'custom',
          path: [nombre],
          message: 'Falta: R2 necesita las cuatro variables R2_*',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;
