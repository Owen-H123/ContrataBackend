import { z } from 'zod';
import { EstadoInforme } from '../entities/informe.entity.js';

const tecnicoIds = z
  .array(z.uuid('Un técnico no es válido'))
  .max(50)
  .transform((ids) => [...new Set(ids)]);

export const crearInformeSchema = z.object({
  ordenId: z.uuid('La orden no es válida'),
  sitioId: z.uuid('El sitio no es válido'),
  tecnicoIds: tecnicoIds.default([]),
});
export type CrearInformeDto = z.infer<typeof crearInformeSchema>;

export const asignarTecnicosSchema = z.object({ tecnicoIds });
export type AsignarTecnicosDto = z.infer<typeof asignarTecnicosSchema>;

export const ubicacionSchema = z.object({
  latitud: z.number().min(-90).max(90),
  longitud: z.number().min(-180).max(180),
});
export type UbicacionDto = z.infer<typeof ubicacionSchema>;

/** Filtros de `GET /informes`. Un técnico solo ve los suyos, filtre lo que filtre. */
export const filtrosInformeSchema = z.object({
  estado: z.enum(EstadoInforme).optional(),
  ordenId: z.uuid('La orden no es válida').optional(),
  sitioId: z.uuid('El sitio no es válido').optional(),
  tecnicoId: z.uuid('El técnico no es válido').optional(),
  /** Busca en el código o nombre del sitio y en el número de la orden. */
  q: z.string().trim().min(1).max(60).optional(),
});
export type FiltrosInformeDto = z.infer<typeof filtrosInformeSchema>;

/** Al observar hay que decir qué corregir; al aprobar, el comentario es opcional. */
export const revisarInformeSchema = z
  .object({
    decision: z.enum(['APROBAR', 'OBSERVAR']),
    comentario: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((r) => r.decision === 'APROBAR' || r.comentario, {
    message: 'Escribe qué hay que corregir',
    path: ['comentario'],
  });
export type RevisarInformeDto = z.infer<typeof revisarInformeSchema>;
