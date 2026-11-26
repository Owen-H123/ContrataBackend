import { z } from 'zod';
import {
  CategoriaGasto,
  ClaseComprobante,
  TipoComprobante,
} from '../entities/comprobante.entity.js';
import { MedioPagoComprobante } from '../entities/pago-comprobante.entity.js';

const fecha = z.iso.date('Usa el formato AAAA-MM-DD');
const monto = z
  .number('Escribe un monto')
  .min(0, 'No puede ser negativo')
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

const campos = z.object({
  tipo: z.enum(TipoComprobante),
  clase: z.enum(ClaseComprobante, 'Elige el tipo de comprobante'),
  serie: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,10}$/, 'La serie es como E001, F001 o B001'),
  numero: z
    .string()
    .trim()
    .regex(/^\d{1,20}$/, 'El número son solo dígitos')
    // «000279» y «279» son el mismo.
    .transform((n) => String(Number(n))),
  fechaEmision: fecha,
  fechaVencimiento: fecha.nullable().optional(),
  clienteId: z.uuid().nullable().optional(),
  contraparteDocumento: z
    .string()
    .trim()
    .regex(/^(\d{8}|\d{11})$/, 'RUC (11 dígitos) o DNI (8)'),
  contraparteNombre: z
    .string()
    .trim()
    .min(2, 'Escribe la razón social o el nombre')
    .max(160),
  moneda: z.enum(['PEN', 'USD']).default('PEN'),
  tipoCambio: z.number().positive().max(100).nullable().optional(),
  baseImponible: monto,
  igv: monto,
  noGravado: monto.default(0),
  total: monto.refine((n) => n > 0, 'El total debe ser mayor que 0'),
  categoria: z.enum(CategoriaGasto).nullable().optional(),
  descripcion: z
    .string()
    .trim()
    .min(2, 'Describe qué es')
    .max(300, 'Máximo 300 caracteres'),
  trabajoId: z.uuid().nullable().optional(),
  centroCosto: textoOpcional(80),
  nota: textoOpcional(500),
});

/** El total tiene que ser base + IGV + no gravado (con un margen de 5 céntimos por redondeo). */
const cuadra = (d: {
  baseImponible?: number;
  igv?: number;
  noGravado?: number;
  total?: number;
}) =>
  d.total === undefined ||
  d.baseImponible === undefined ||
  d.igv === undefined ||
  Math.abs(d.baseImponible + d.igv + (d.noGravado ?? 0) - d.total) <= 0.05;

export const crearComprobanteSchema = campos
  .refine(cuadra, {
    message: 'El total no cuadra con base + IGV',
    path: ['total'],
  })
  .refine((d) => d.moneda === 'PEN' || !!d.tipoCambio, {
    message: 'Indica el tipo de cambio',
    path: ['tipoCambio'],
  });
export type CrearComprobanteDto = z.infer<typeof crearComprobanteSchema>;

export const actualizarComprobanteSchema = campos
  .omit({ tipo: true })
  .extend({ anulado: z.boolean() })
  .partial()
  .refine(cuadra, {
    message: 'El total no cuadra con base + IGV',
    path: ['total'],
  });
export type ActualizarComprobanteDto = z.infer<
  typeof actualizarComprobanteSchema
>;

export const filtrosComprobanteSchema = z.object({
  tipo: z.enum(TipoComprobante).optional(),
  /** AAAA-MM: por mes de emisión. */
  mes: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'El mes no es válido (AAAA-MM)')
    .optional(),
  anio: z.coerce.number().int().min(2020).max(2100).optional(),
  estado: z.enum(['PENDIENTE', 'PARCIAL', 'PAGADO', 'ANULADO']).optional(),
  trabajoId: z.uuid().optional(),
  q: z.string().trim().min(1).max(80).optional(),
});
export type FiltrosComprobanteDto = z.infer<typeof filtrosComprobanteSchema>;

export const pagoSchema = z.object({
  fecha,
  monto: monto.refine((n) => n > 0, 'El monto debe ser mayor que 0'),
  medio: z.enum(MedioPagoComprobante, 'Elige cómo se pagó'),
  operacion: textoOpcional(60),
  nota: textoOpcional(200),
});
export type PagoDto = z.infer<typeof pagoSchema>;

export const mesSchema = z.object({
  mes: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'El mes no es válido (AAAA-MM)'),
});
export type MesDto = z.infer<typeof mesSchema>;

export const contraparteSchema = z.object({
  q: z.string().trim().min(2).max(60),
});
export type ContraparteDto = z.infer<typeof contraparteSchema>;
