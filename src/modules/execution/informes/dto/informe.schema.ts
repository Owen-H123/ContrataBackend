import { z } from 'zod';
import { crearItemSchema } from '../../../planning/ordenes-compra/dto/orden-compra.schema.js';
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

/** La ubicación llega como coordenadas (GPS del celular) o como link de Google Maps. */
export const ubicacionSchema = z.union([
  z.object({
    latitud: z.number().min(-90).max(90),
    longitud: z.number().min(-180).max(180),
  }),
  z.object({ enlace: z.string().trim().min(3).max(500) }),
]);
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

/** Al reabrir se puede indicar qué falta. */
export const reabrirInformeSchema = z.object({
  comentario: z.string().trim().min(1).max(1000).optional(),
});
export type ReabrirInformeDto = z.infer<typeof reabrirInformeSchema>;

/**
 * Un ítem nuevo para este informe: la orden y el sitio son los del informe,
 * así que no se indican. Lleva los mismos campos que una línea de la orden.
 */
export const agregarActividadSchema = crearItemSchema.omit({ sitioId: true });
export type AgregarActividadDto = z.infer<typeof agregarActividadSchema>;
