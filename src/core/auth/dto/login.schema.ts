import { z } from 'zod';

export const loginSchema = z.object({
  usuario: z.string().trim().toLowerCase().min(1).max(60),
  password: z.string().min(1).max(72),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const cambiarPasswordSchema = z.object({
  actual: z.string().min(1).max(72),
  nueva: z.string().min(8, 'Mínimo 8 caracteres').max(72),
});
export type CambiarPasswordDto = z.infer<typeof cambiarPasswordSchema>;
