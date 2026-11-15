import { z } from 'zod';
import { EtapaEvidencia } from '../../../../shared/enums/etapa-evidencia.enum.js';
import { TipoEvidencia } from '../entities/evidencia.entity.js';

/** Formatos aceptados y la extensión con la que se guardan en R2. */
export const EXTENSIONES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
} as const;
export type TipoImagen = keyof typeof EXTENSIONES;

/** Tamaño máximo de una foto. */
export const MAX_BYTES = 25 * 1024 * 1024;

const archivo = {
  nombreArchivo: z.string().trim().min(1).max(200),
  tipoContenido: z.enum(
    Object.keys(EXTENSIONES) as [TipoImagen, ...TipoImagen[]],
    'Solo se aceptan fotos JPG, PNG, WEBP o HEIC',
  ),
  /** Tamaño que declara el celular; el real se verifica al confirmar. */
  bytes: z.int().positive().max(MAX_BYTES, 'La foto supera 25 MB'),
  comentario: z.string().trim().max(500).optional(),
  /** Cuándo se tomó, según el celular (ISO 8601 con zona horaria). */
  tomadaEn: z.iso.datetime({ offset: true }).optional(),
};

/**
 * Pedir un enlace para subir una foto.
 * - ACTIVIDAD: indica el ítem (`itemId`) y la etapa (antes, durante o finalizado).
 * - EPP: foto del personal con su equipo de protección; `tecnicoId` es opcional.
 * - PANORAMICA: panorámica de la torre completa.
 * - ESTACION: foto de las estaciones y equipos.
 */
export const solicitarSubidaSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal(TipoEvidencia.ACTIVIDAD),
    itemId: z.uuid('La actividad no es válida'),
    etapa: z.enum(EtapaEvidencia),
    ...archivo,
  }),
  z.object({
    tipo: z.literal(TipoEvidencia.EPP),
    tecnicoId: z.uuid('El técnico no es válido').optional(),
    ...archivo,
  }),
  z.object({ tipo: z.literal(TipoEvidencia.PANORAMICA), ...archivo }),
  z.object({ tipo: z.literal(TipoEvidencia.ESTACION), ...archivo }),
]);
export type SolicitarSubidaDto = z.infer<typeof solicitarSubidaSchema>;

export const editarEvidenciaSchema = z.object({
  comentario: z.string().trim().max(500).nullable(),
});
export type EditarEvidenciaDto = z.infer<typeof editarEvidenciaSchema>;
