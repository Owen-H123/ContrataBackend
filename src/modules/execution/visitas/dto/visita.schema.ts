import { z } from 'zod';
import {
  EXTENSIONES,
  MAX_BYTES,
  type TipoImagen,
} from '../../evidencias/dto/evidencia.schema.js';
import { SeccionFotoVisita } from '../entities/foto-visita.entity.js';
import { EstadoVisita } from '../entities/visita-tecnica.entity.js';

export {
  ubicacionSchema,
  type UbicacionDto,
} from '../../informes/dto/informe.schema.js';

const fecha = z.iso.date('La fecha no es válida (AAAA-MM-DD)');
const observaciones = z.string().trim().max(2000).nullable();

/**
 * Sitio que el técnico registra en el momento porque todavía no existe en el sistema.
 * Sin cliente: la visita técnica identifica el sitio por su código y nombre.
 */
const sitioNuevoSchema = z.object({
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9][A-Z0-9-]{2,39}$/,
      'Usa de 3 a 40 letras, números o guiones (ejemplo: PE-03-AN-00595-15)',
    ),
  nombre: z.string().trim().min(2, 'Escribe el nombre del sitio').max(120),
  direccion: z.string().trim().max(200).optional(),
});

/** Se indica un sitio existente (`sitioId`) o uno nuevo (`sitioNuevo`), no ambos. */
export const crearVisitaSchema = z
  .object({
    sitioId: z.uuid('El sitio no es válido').optional(),
    sitioNuevo: sitioNuevoSchema.optional(),
    fecha,
    observaciones: observaciones.optional(),
  })
  .refine((d) => !!d.sitioId !== !!d.sitioNuevo, {
    message: 'Elige un sitio de la lista o registra uno nuevo',
    path: ['sitioId'],
  });
export type CrearVisitaDto = z.infer<typeof crearVisitaSchema>;

export const editarVisitaSchema = z.object({ fecha, observaciones }).partial();
export type EditarVisitaDto = z.infer<typeof editarVisitaSchema>;

export const cambiarEstadoVisitaSchema = z.object({
  estado: z.enum(EstadoVisita),
  /** Motivo opcional, p. ej. por qué rechazaron el acceso. */
  comentario: z.string().trim().min(1).max(1000).optional(),
});
export type CambiarEstadoVisitaDto = z.infer<typeof cambiarEstadoVisitaSchema>;

/** Filtros de `GET /visitas`. Un técnico solo ve las suyas, filtre lo que filtre. */
export const filtrosVisitaSchema = z.object({
  estado: z.enum(EstadoVisita).optional(),
  /** Busca en el código o nombre del sitio. */
  q: z.string().trim().min(1).max(60).optional(),
});
export type FiltrosVisitaDto = z.infer<typeof filtrosVisitaSchema>;

/** Medida en metros: positiva, con hasta 2 decimales; null la borra. */
const medida = z
  .number()
  .positive('La medida debe ser mayor que 0')
  .max(99_999, 'La medida es demasiado grande')
  .transform((n) => Math.round(n * 100) / 100)
  .nullable()
  .optional();

export const crearHallazgoSchema = z.object({
  descripcion: z
    .string()
    .trim()
    .min(2, 'Describe la anomalía encontrada')
    .max(300),
  correctivo: z.string().trim().max(500).nullable().optional(),
  largo: medida,
  ancho: medida,
  alto: medida,
  comentario: z.string().trim().max(2000).nullable().optional(),
});
export type CrearHallazgoDto = z.infer<typeof crearHallazgoSchema>;

export const editarHallazgoSchema = crearHallazgoSchema.partial();
export type EditarHallazgoDto = z.infer<typeof editarHallazgoSchema>;

/** Pedir el enlace para subir una foto: a una sección fija o a un hallazgo. */
export const subirFotoVisitaSchema = z
  .object({
    seccion: z.enum(SeccionFotoVisita),
    hallazgoId: z.uuid('El hallazgo no es válido').optional(),
    nombreArchivo: z.string().trim().min(1).max(200),
    tipoContenido: z.enum(
      Object.keys(EXTENSIONES) as [TipoImagen, ...TipoImagen[]],
      'Solo se aceptan fotos JPG, PNG, WEBP o HEIC',
    ),
    bytes: z.int().positive().max(MAX_BYTES, 'La foto supera 25 MB'),
    comentario: z.string().trim().max(500).optional(),
    tomadaEn: z.iso.datetime({ offset: true }).optional(),
  })
  .refine(
    (d) =>
      (d.seccion === SeccionFotoVisita.HALLAZGO ||
        d.seccion === SeccionFotoVisita.MEDIDA) === !!d.hallazgoId,
    {
      message: 'Las fotos de un ítem llevan su hallazgoId (y solo ellas)',
      path: ['hallazgoId'],
    },
  );
export type SubirFotoVisitaDto = z.infer<typeof subirFotoVisitaSchema>;

export const editarFotoVisitaSchema = z.object({
  comentario: z.string().trim().max(500).nullable(),
});
export type EditarFotoVisitaDto = z.infer<typeof editarFotoVisitaSchema>;

export const comentarVisitaSchema = z.object({
  texto: z.string().trim().min(1, 'Escribe un comentario').max(1000),
});
export type ComentarVisitaDto = z.infer<typeof comentarVisitaSchema>;
