import { z } from 'zod';
import { Rol } from '../../../../shared/enums/rol.enum.js';

const nombre = z.string().trim().min(2).max(120);
const usuario = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9._-]{3,60}$/,
    'Usa de 3 a 60 letras, números, punto, guion o guion bajo',
  );
const password = z.string().min(8, 'Mínimo 8 caracteres').max(72);

export const crearUsuarioSchema = z.object({
  nombre,
  usuario,
  password,
  rol: z.enum(Rol),
});
export type CrearUsuarioDto = z.infer<typeof crearUsuarioSchema>;

export const actualizarUsuarioSchema = z
  .object({
    nombre,
    password,
    rol: z.enum(Rol),
    activo: z.boolean(),
  })
  .partial();
export type ActualizarUsuarioDto = z.infer<typeof actualizarUsuarioSchema>;

