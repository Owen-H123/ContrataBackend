import { z } from 'zod';

const razonSocial = z.string().trim().min(2).max(160);
const ruc = z
  .string()
  .trim()
  .regex(/^\d{11}$/, 'El RUC debe tener 11 dígitos');

export const crearClienteSchema = z.object({ razonSocial, ruc });
export type CrearClienteDto = z.infer<typeof crearClienteSchema>;

export const actualizarClienteSchema = z
  .object({ razonSocial, ruc, activo: z.boolean() })
  .partial();
export type ActualizarClienteDto = z.infer<typeof actualizarClienteSchema>;
