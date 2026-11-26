import { z } from 'zod';
import { TipoArchivoSolicitud } from '../entities/archivo-solicitud.entity.js';
import {
  EstadoSolicitud,
  MedioAbono,
  TipoSolicitud,
} from '../entities/solicitud-dinero.entity.js';

/** Fotos JPG/PNG/WEBP/HEIC o PDF, como en el formulario (hasta 10 MB cada uno). */
export const EXTENSIONES_SOLICITUD = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
} as const;
export type TipoContenidoSolicitud = keyof typeof EXTENSIONES_SOLICITUD;
export const MAX_BYTES_SOLICITUD = 10 * 1024 * 1024;
export const MAX_ARCHIVOS = 10;

const monto = z
  .number('Escribe el monto')
  .positive('El monto debe ser mayor que 0')
  .max(999_999, 'El monto es demasiado grande')
  .transform((n) => Math.round(n * 100) / 100);
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((t) => (t ? t : null));

const datosSolicitud = z.object({
  documento: z
    .string()
    .trim()
    .regex(/^(\d{8}|\d{11})$/, 'El DNI tiene 8 dígitos y el RUC 11'),
  beneficiario: z
    .string()
    .trim()
    .min(3, 'Escribe nombres y apellidos')
    .max(160),
  banco: textoOpcional(40),
  cuenta: z.string().trim().min(5, 'Escribe el número de cuenta').max(40),
  monto,
  concepto: textoOpcional(300),
  tipo: z.enum(TipoSolicitud),
  sitioId: z.uuid('El sitio no es válido').nullable().optional(),
  centroCosto: textoOpcional(60),
  /** Trabajo del seguimiento (y su OC) al que se carga, si se sabe. */
  trabajoId: z.uuid('El trabajo no es válido').nullable().optional(),
  fecha: z.iso.date('La fecha no es válida'),
});

/**
 * Centro de costo: un sitio o un centro de costo escrito, uno de los dos. Si se elige un
 * trabajo, basta con él (el sitio se toma del trabajo).
 */
const conCentroDeCosto = <
  T extends z.ZodType<{
    sitioId?: string | null;
    centroCosto?: string | null;
    trabajoId?: string | null;
  }>,
>(
  s: T,
) =>
  s.refine(
    (d) =>
      !!d.sitioId !== !!d.centroCosto ||
      (!!d.trabajoId && !d.sitioId && !d.centroCosto),
    {
      message: 'Elige el ID site o el centro de costo',
      path: ['sitioId'],
    },
  );

export const crearSolicitudSchema = conCentroDeCosto(datosSolicitud);
export type CrearSolicitudDto = z.infer<typeof crearSolicitudSchema>;

export const editarSolicitudSchema = conCentroDeCosto(datosSolicitud);
export type EditarSolicitudDto = z.infer<typeof editarSolicitudSchema>;

export const filtrosSolicitudSchema = z.object({
  /** MIAS: las que pedí. POR_APROBAR / POR_ABONAR: bandejas. TODAS: todo (si tengo permiso). */
  vista: z.enum(['MIAS', 'POR_APROBAR', 'POR_ABONAR', 'TODAS']).optional(),
  estado: z.enum(EstadoSolicitud).optional(),
  q: z.string().trim().min(1).max(60).optional(),
  mes: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});
export type FiltrosSolicitudDto = z.infer<typeof filtrosSolicitudSchema>;

export const aprobarSchema = z.object({
  /** Si se aprueba menos de lo pedido. */
  montoAprobado: monto.optional(),
  comentario: textoOpcional(500),
});
export type AprobarDto = z.infer<typeof aprobarSchema>;

export const rechazarSchema = z.object({
  motivo: z.string().trim().min(3, 'Escribe el motivo del rechazo').max(500),
});
export type RechazarDto = z.infer<typeof rechazarSchema>;

export const abonarSchema = z.object({
  abonadoEn: z.iso.date('La fecha no es válida'),
  medioAbono: z.enum(MedioAbono),
  operacion: textoOpcional(60),
});
export type AbonarDto = z.infer<typeof abonarSchema>;

export const subirArchivoSchema = z.object({
  tipo: z.enum(TipoArchivoSolicitud),
  nombreArchivo: z.string().trim().min(1).max(200),
  tipoContenido: z.enum(
    Object.keys(EXTENSIONES_SOLICITUD) as [
      TipoContenidoSolicitud,
      ...TipoContenidoSolicitud[],
    ],
    'Solo fotos (JPG, PNG, WEBP, HEIC) o PDF',
  ),
  bytes: z.int().positive().max(MAX_BYTES_SOLICITUD, 'El archivo supera 10 MB'),
  monto: monto.nullable().optional(),
});
export type SubirArchivoDto = z.infer<typeof subirArchivoSchema>;

export const trabajosParaElegirSchema = z.object({
  q: z.string().trim().min(1).max(60).optional(),
  sitioId: z.uuid().optional(),
});
export type TrabajosParaElegirDto = z.infer<typeof trabajosParaElegirSchema>;

export const beneficiariosSchema = z.object({
  q: z.string().trim().min(2).max(60),
});
