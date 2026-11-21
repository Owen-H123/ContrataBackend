import { z } from 'zod';
import {
  EXTENSIONES,
  MAX_BYTES,
  type TipoImagen,
} from '../../evidencias/dto/evidencia.schema.js';
import {
  EstadoVisita,
  MotivoVisita,
} from '../entities/visita-tecnica.entity.js';

export {
  ubicacionSchema,
  type UbicacionDto,
} from '../../informes/dto/informe.schema.js';

const fecha = z.iso.date('La fecha no es válida (AAAA-MM-DD)');
const observaciones = z.string().trim().max(2000).nullable();

export const crearVisitaSchema = z.object({
  ordenId: z.uuid('La orden no es válida'),
  sitioId: z.uuid('El sitio no es válido'),
  fecha,
  motivo: z.enum(MotivoVisita, 'Elige el motivo de la visita'),
  observaciones: observaciones.optional(),
});
export type CrearVisitaDto = z.infer<typeof crearVisitaSchema>;

/** Datos que se pueden corregir mientras la visita está en curso. */
export const editarVisitaSchema = z
  .object({ fecha, motivo: z.enum(MotivoVisita), observaciones })
  .partial();
export type EditarVisitaDto = z.infer<typeof editarVisitaSchema>;

/** Filtros de `GET /visitas`. Un técnico solo ve las suyas, filtre lo que filtre. */
export const filtrosVisitaSchema = z.object({
  estado: z.enum(EstadoVisita).optional(),
  /** Busca en el código o nombre del sitio y en el número de la orden. */
  q: z.string().trim().min(1).max(60).optional(),
});
export type FiltrosVisitaDto = z.infer<typeof filtrosVisitaSchema>;

export const subirFotoVisitaSchema = z.object({
  nombreArchivo: z.string().trim().min(1).max(200),
  tipoContenido: z.enum(
    Object.keys(EXTENSIONES) as [TipoImagen, ...TipoImagen[]],
    'Solo se aceptan fotos JPG, PNG, WEBP o HEIC',
  ),
  bytes: z.int().positive().max(MAX_BYTES, 'La foto supera 25 MB'),
  comentario: z.string().trim().max(500).optional(),
  tomadaEn: z.iso.datetime({ offset: true }).optional(),
});
export type SubirFotoVisitaDto = z.infer<typeof subirFotoVisitaSchema>;

export const editarFotoVisitaSchema = z.object({
  comentario: z.string().trim().max(500).nullable(),
});
export type EditarFotoVisitaDto = z.infer<typeof editarFotoVisitaSchema>;

export const comentarVisitaSchema = z.object({
  texto: z.string().trim().min(1, 'Escribe un comentario').max(1000),
});
export type ComentarVisitaDto = z.infer<typeof comentarVisitaSchema>;

export const reabrirVisitaSchema = z.object({
  comentario: z.string().trim().min(1).max(1000).optional(),
});
export type ReabrirVisitaDto = z.infer<typeof reabrirVisitaSchema>;
