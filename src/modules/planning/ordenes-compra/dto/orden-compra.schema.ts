import { z } from 'zod';
import {
  ETAPAS_EN_ORDEN,
  EtapaEvidencia,
} from '../../../../shared/enums/etapa-evidencia.enum.js';
import { EstadoOrden } from '../entities/orden-compra.entity.js';

const fecha = z.iso.date('Usa el formato AAAA-MM-DD');

/** Sin repetidos y siempre en el orden antes → proceso → después. */
const etapas = z
  .array(z.enum(EtapaEvidencia))
  .transform((lista) => ETAPAS_EN_ORDEN.filter((e) => lista.includes(e)));

const item = z.object({
  /** Si se omite, se asigna la siguiente de 10 en 10. */
  posicion: z.int().positive().max(99_999).optional(),
  sitioId: z.uuid('El sitio no es válido'),
  codigoMaterial: z.string().trim().min(1).max(20).nullable().optional(),
  descripcion: z.string().trim().min(2).max(300),
  detalle: z.string().trim().max(500).nullable().optional(),
  cantidad: z.number().positive().max(999_999_999),
  unidad: z.string().trim().toUpperCase().min(1).max(10),
  precioUnitario: z.number().nonnegative().max(9_999_999_999),
  fechaEntrega: fecha.nullable().optional(),
  /** Si se omite, se exigen las tres etapas. */
  etapas: etapas.optional(),
});

export const crearItemSchema = item;
export type CrearItemDto = z.infer<typeof crearItemSchema>;

export const actualizarItemSchema = item.partial();
export type ActualizarItemDto = z.infer<typeof actualizarItemSchema>;

const numero = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{3,20}$/, 'Usa de 3 a 20 letras, números o guiones');
const moneda = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Usa el código de 3 letras (PEN, USD)');
const observaciones = z.string().trim().max(500).nullable();

export const crearOrdenSchema = z
  .object({
    // Opcional: sin número la orden queda como «Orden pendiente».
    numero: numero.nullable().optional(),
    clienteId: z.uuid('El cliente no es válido'),
    fechaEmision: fecha,
    moneda: moneda.optional(),
    observaciones: observaciones.optional(),
    items: z.array(item).min(1, 'La orden necesita al menos un ítem').max(300),
  })
  .refine(
    ({ items }) => {
      const posiciones = items.flatMap((i) => i.posicion ?? []);
      return new Set(posiciones).size === posiciones.length;
    },
    { message: 'Hay posiciones repetidas', path: ['items'] },
  );
export type CrearOrdenDto = z.infer<typeof crearOrdenSchema>;

/** El cliente no se cambia: los sitios de los ítems dependen de él. */
export const actualizarOrdenSchema = z
  .object({
    numero: numero.nullable(),
    fechaEmision: fecha,
    moneda,
    observaciones,
    estado: z.enum(EstadoOrden),
  })
  .partial();
export type ActualizarOrdenDto = z.infer<typeof actualizarOrdenSchema>;

/** Filtros de `GET /ordenes-compra`. */
export const filtrosOrdenSchema = z.object({
  clienteId: z.uuid('El cliente no es válido').optional(),
  sitioId: z.uuid('El sitio no es válido').optional(),
  estado: z.enum(EstadoOrden).optional(),
  q: z.string().trim().min(1).max(20).optional(),
});
export type FiltrosOrdenDto = z.infer<typeof filtrosOrdenSchema>;
