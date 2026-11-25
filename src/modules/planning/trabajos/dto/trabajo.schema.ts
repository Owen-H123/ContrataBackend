import { z } from 'zod';
import {
  AreaTrabajo,
  Criticidad,
  EtapaTrabajo,
  MotivoCancelacion,
} from '../entities/trabajo.entity.js';

const fecha = z.iso.date('Usa el formato AAAA-MM-DD');
const fechaOpcional = fecha.nullable().optional();
const monto = z
  .number('Escribe un monto')
  .nonnegative('No puede ser negativo')
  .max(99_999_999, 'El monto es demasiado grande')
  .transform((n) => Math.round(n * 100) / 100);
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((t) => (t ? t : null));

/** Todos los datos editables de un trabajo; los hitos son fechas (null = todavía no). */
const campos = z.object({
  clienteId: z.uuid('Elige el cliente'),
  sitioId: z.uuid('Elige el sitio'),
  descripcion: z
    .string()
    .trim()
    .min(3, 'Describe el trabajo')
    .max(500, 'Máximo 500 caracteres'),
  area: z.enum(AreaTrabajo, 'Elige el área'),
  criticidad: z.enum(Criticidad, 'Criticidad no válida').nullable().optional(),
  encargado: textoOpcional(60),
  monto: monto.nullable().optional(),
  solicitadoEn: fecha,
  enviadoEn: fechaOpcional,
  revisadoEn: fechaOpcional,
  aprobadoEn: fechaOpcional,
  aprobadoPor: textoOpcional(60),
  ordenId: z.uuid().nullable().optional(),
  ocNumero: textoOpcional(20),
  ocEn: fechaOpcional,
  ejecucionInicio: fechaOpcional,
  ejecutadoEn: fechaOpcional,
  eaResponsable: textoOpcional(60),
  eaSolicitadaEn: fechaOpcional,
  eaAprobadaEn: fechaOpcional,
  facturaNumero: textoOpcional(20),
  facturadoEn: fechaOpcional,
  montoFacturado: monto.nullable().optional(),
  cobradoEn: fechaOpcional,
  montoCobrado: monto.nullable().optional(),
  cancelado: z.enum(MotivoCancelacion).nullable().optional(),
  canceladoEn: fechaOpcional,
  comentario: textoOpcional(2000),
});

export const crearTrabajoSchema = campos;
export type CrearTrabajoDto = z.infer<typeof crearTrabajoSchema>;

export const actualizarTrabajoSchema = campos.partial();
export type ActualizarTrabajoDto = z.infer<typeof actualizarTrabajoSchema>;

export const filtrosTrabajoSchema = z.object({
  anio: z.coerce.number().int().min(2020).max(2100).optional(),
  clienteId: z.uuid().optional(),
  area: z.enum(AreaTrabajo).optional(),
  etapa: z.enum(EtapaTrabajo).optional(),
  q: z.string().trim().min(1).max(80).optional(),
});
export type FiltrosTrabajoDto = z.infer<typeof filtrosTrabajoSchema>;

export const revisionSchema = z.object({
  monto: monto.refine((n) => n > 0, 'El monto debe ser mayor que 0'),
  fecha,
  nota: textoOpcional(300),
});
export type RevisionDto = z.infer<typeof revisionSchema>;

export const comentarioSchema = z.object({
  texto: z.string().trim().min(1, 'Escribe el comentario').max(500),
});
export type ComentarioDto = z.infer<typeof comentarioSchema>;
