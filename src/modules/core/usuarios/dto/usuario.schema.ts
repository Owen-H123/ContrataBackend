import { z } from 'zod';
import { Permiso } from '../../../../shared/enums/permiso.enum.js';
import { Rol } from '../../../../shared/enums/rol.enum.js';

const permisos = z
  .array(z.enum(Permiso))
  .max(10)
  .transform((p) => [...new Set(p)]);

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
  permisos: permisos.optional(),
});
export type CrearUsuarioDto = z.infer<typeof crearUsuarioSchema>;

export const actualizarUsuarioSchema = z
  .object({
    nombre,
    password,
    rol: z.enum(Rol),
    activo: z.boolean(),
    permisos,
  })
  .partial();
export type ActualizarUsuarioDto = z.infer<typeof actualizarUsuarioSchema>;
