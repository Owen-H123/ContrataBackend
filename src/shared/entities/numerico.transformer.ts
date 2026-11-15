import type { ValueTransformer } from 'typeorm';

/**
 * PostgreSQL devuelve las columnas `numeric` como texto para no perder precisión.
 * Este transformador las entrega como número a la aplicación.
 */
export const numerico: ValueTransformer = {
  to: (valor?: number | null) => valor,
  from: (valor: string | null) => (valor === null ? null : Number(valor)),
};

/** Redondea a 2 decimales (montos en moneda). */
export function redondear2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
