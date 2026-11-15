import { z } from 'zod';

const codigo = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9][A-Z0-9-]{2,39}$/,
    'Usa de 3 a 40 letras, números o guiones (ejemplo: PE-03-AN-00595-15)',
  );
const nombre = z.string().trim().min(2).max(120);
const direccion = z.string().trim().max(200).nullable();
const latitud = z.number().min(-90).max(90).nullable();
const longitud = z.number().min(-180).max(180).nullable();

export const crearSitioSchema = z.object({
  codigo,
  nombre,
  clienteId: z.uuid('El cliente no es válido'),
  direccion: direccion.optional(),
  latitud: latitud.optional(),
  longitud: longitud.optional(),
});
export type CrearSitioDto = z.infer<typeof crearSitioSchema>;

export const actualizarSitioSchema = crearSitioSchema
  .extend({ activo: z.boolean() })
  .partial();
export type ActualizarSitioDto = z.infer<typeof actualizarSitioSchema>;

/** Filtros de `GET /sitios`: `?clienteId=…&q=estrellas&activo=true`. */
export const filtrosSitioSchema = z.object({
  clienteId: z.uuid('El cliente no es válido').optional(),
  q: z.string().trim().min(1).max(60).optional(),
  activo: z.stringbool().optional(),
});
export type FiltrosSitioDto = z.infer<typeof filtrosSitioSchema>;
