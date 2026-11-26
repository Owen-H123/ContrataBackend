import { z } from 'zod';
import { MedioPago } from '../entities/tareo-fila.entity.js';
import { TIPOS_VOUCHER } from '../tareo.service.js';
import {
  ConceptoMovimiento,
  TipoMovimiento,
} from '../entities/tareo-movimiento.entity.js';
import {
  PeriodicidadSueldo,
  TipoTrabajador,
} from '../entities/trabajador.entity.js';

const monto = z
  .number('Escribe un monto')
  .nonnegative('No puede ser negativo')
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

// ---------- Personal ----------

const trabajadorBase = z.object({
  nombres: z.string().trim().min(3, 'Escribe apellidos y nombres').max(160),
  // DNI peruano (8 dígitos) o carné de extranjería (hasta 12). Vacío = sin DNI.
  dni: z
    .string()
    .trim()
    .regex(/^\d{8,12}$/, 'El DNI tiene 8 dígitos')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  cargo: z.string().trim().toUpperCase().min(2, 'Escribe el cargo').max(60),
  tipo: z.enum(TipoTrabajador),
  pagoDia: monto.nullable().optional(),
  sueldo: monto.nullable().optional(),
  periodicidad: z.enum(PeriodicidadSueldo).nullable().optional(),
  telefono: textoOpcional(20),
  banco: textoOpcional(40),
  cuenta: textoOpcional(40),
});

const reglasPago = <
  T extends z.ZodType<Partial<z.infer<typeof trabajadorBase>>>,
>(
  s: T,
) =>
  s.superRefine((d, ctx) => {
    if (
      d.tipo === TipoTrabajador.JORNAL &&
      (d.pagoDia === null || d.pagoDia === undefined)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['pagoDia'],
        message: 'Indica el pago por día',
      });
    if (d.tipo === TipoTrabajador.FIJO) {
      if (d.sueldo === null || d.sueldo === undefined)
        ctx.addIssue({
          code: 'custom',
          path: ['sueldo'],
          message: 'Indica el sueldo',
        });
      if (!d.periodicidad)
        ctx.addIssue({
          code: 'custom',
          path: ['periodicidad'],
          message: 'Indica si es quincenal o mensual',
        });
    }
  });

export const crearTrabajadorSchema = reglasPago(trabajadorBase);
export type CrearTrabajadorDto = z.infer<typeof crearTrabajadorSchema>;

export const actualizarTrabajadorSchema = reglasPago(
  trabajadorBase.extend({ activo: z.boolean() }),
);
export type ActualizarTrabajadorDto = z.infer<
  typeof actualizarTrabajadorSchema
>;

export const filtrosPersonalSchema = z.object({
  q: z.string().trim().min(1).max(60).optional(),
  activo: z.stringbool().optional(),
  tipo: z.enum(TipoTrabajador).optional(),
});
export type FiltrosPersonalDto = z.infer<typeof filtrosPersonalSchema>;

// ---------- Tareo ----------

/** Domingo con que empieza la semana del tareo. */
export const semanaSchema = z.iso
  .date('La semana no es válida (AAAA-MM-DD)')
  .refine(
    (f) => new Date(`${f}T12:00:00Z`).getUTCDay() === 0,
    'La semana empieza en domingo',
  );

export const consultarSemanaSchema = z.object({ semana: semanaSchema });
export type ConsultarSemanaDto = z.infer<typeof consultarSemanaSchema>;

export const agregarFilaSchema = z.object({
  semana: semanaSchema,
  trabajadorIds: z
    .array(z.uuid('El trabajador no es válido'))
    .min(1, 'Elige al menos un trabajador')
    .max(200),
});
export type AgregarFilaDto = z.infer<typeof agregarFilaSchema>;

export const editarFilaSchema = z
  .object({
    dias: z.array(z.boolean()).length(7),
    pagoDia: monto,
    cargo: z.string().trim().toUpperCase().min(2).max(60),
    retenido: z.boolean(),
    comentario: textoOpcional(500),
    /**
     * «Otros abonos» / «Otros descuentos» escritos directo en la celda, como en el Excel.
     * Reemplazan el abono (o descuento) de la fila; 0 o null lo quitan. Si la fila ya tiene
     * varios con su concepto, se editan desde el detalle.
     */
    otrosAbonos: monto.nullable(),
    otrosDescuentos: monto.nullable(),
  })
  .partial();
export type EditarFilaDto = z.infer<typeof editarFilaSchema>;

export const pagarFilaSchema = z.object({
  /** null deshace el pago. */
  pagadoEn: z.iso.date('La fecha no es válida').nullable(),
  medioPago: z.enum(MedioPago).nullable().optional(),
  operacion: textoOpcional(60),
});
export type PagarFilaDto = z.infer<typeof pagarFilaSchema>;

export const crearMovimientoSchema = z.object({
  tipo: z.enum(TipoMovimiento),
  concepto: z.enum(ConceptoMovimiento),
  monto: monto.refine((n) => n > 0, 'El monto debe ser mayor que 0'),
  nota: textoOpcional(200),
});
export type CrearMovimientoDto = z.infer<typeof crearMovimientoSchema>;

export const resumenMesSchema = z.object({
  mes: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'El mes no es válido (AAAA-MM)'),
});
export type ResumenMesDto = z.infer<typeof resumenMesSchema>;

/** Seguimiento: días trabajados de cada uno entre dos fechas (máximo un año). */
export const seguimientoSchema = z
  .object({
    desde: z.iso.date('La fecha no es válida'),
    hasta: z.iso.date('La fecha no es válida'),
  })
  .refine((d) => d.desde <= d.hasta, {
    message: '«Desde» va antes de «hasta»',
    path: ['desde'],
  })
  .refine(
    (d) =>
      new Date(d.hasta).getTime() - new Date(d.desde).getTime() <=
      400 * 86_400_000,
    { message: 'Máximo un año', path: ['hasta'] },
  );
export type SeguimientoDto = z.infer<typeof seguimientoSchema>;

/** Subir el voucher del pago de una semana (foto o PDF). */
export const subirVoucherSchema = z.object({
  nombreArchivo: z.string().trim().min(1).max(200),
  tipoContenido: z.enum(
    Object.keys(TIPOS_VOUCHER) as [
      keyof typeof TIPOS_VOUCHER,
      ...(keyof typeof TIPOS_VOUCHER)[],
    ],
    'Solo fotos (JPG, PNG, WEBP, HEIC) o PDF',
  ),
  bytes: z
    .int()
    .positive()
    .max(10 * 1024 * 1024, 'El archivo supera 10 MB'),
});
export type SubirVoucherDto = z.infer<typeof subirVoucherSchema>;

// ---------- Préstamos ----------

const montoPositivo = monto.refine((n) => n > 0, 'Debe ser mayor que 0');

export const crearPrestamoSchema = z.object({
  trabajadorId: z.uuid('Elige al trabajador'),
  fecha: z.iso.date('La fecha no es válida'),
  monto: montoPositivo,
  cuota: montoPositivo,
  nota: textoOpcional(200),
});
export type CrearPrestamoDto = z.infer<typeof crearPrestamoSchema>;

export const actualizarPrestamoSchema = z
  .object({
    fecha: z.iso.date('La fecha no es válida'),
    monto: montoPositivo,
    cuota: montoPositivo,
    nota: textoOpcional(200),
  })
  .partial();
export type ActualizarPrestamoDto = z.infer<typeof actualizarPrestamoSchema>;

export const filtrosPrestamosSchema = z.object({
  trabajadorId: z.uuid().optional(),
  estado: z.enum(['ACTIVO', 'CANCELADO']).optional(),
});
export type FiltrosPrestamosDto = z.infer<typeof filtrosPrestamosSchema>;

/** Cuota de un préstamo en una semana; 0 la quita. */
export const cuotaSemanaSchema = z.object({ monto });
export type CuotaSemanaDto = z.infer<typeof cuotaSemanaSchema>;

// ---------- Sueldos fijos ----------

export const consultarMesSchema = z.object({
  mes: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'El mes no es válido (AAAA-MM)'),
});
export type ConsultarMesDto = z.infer<typeof consultarMesSchema>;

export const editarPagoFijoSchema = z
  .object({
    sueldo: monto,
    retenido: z.boolean(),
    comentario: textoOpcional(500),
  })
  .partial();
export type EditarPagoFijoDto = z.infer<typeof editarPagoFijoSchema>;

export const movimientoFijoSchema = crearMovimientoSchema.extend({
  fecha: z.iso.date('La fecha no es válida').nullable().optional(),
});
export type MovimientoFijoDto = z.infer<typeof movimientoFijoSchema>;

export const agregarPagoFijoSchema = z.object({
  mes: consultarMesSchema.shape.mes,
  trabajadorId: z.uuid('Elige al trabajador'),
  sueldo: monto.refine((n) => n > 0, 'Indica el sueldo'),
  periodicidad: z.enum(PeriodicidadSueldo),
  actualizarFicha: z.boolean().default(true),
});
export type AgregarPagoFijoDto = z.infer<typeof agregarPagoFijoSchema>;
