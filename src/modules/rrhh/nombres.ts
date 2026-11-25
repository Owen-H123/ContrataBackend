import { ConceptoMovimiento } from './entities/tareo-movimiento.entity.js';

/** Nombre de cada concepto de abono o descuento, para el Excel. */
export const NOMBRE_CONCEPTO_EXCEL: Record<ConceptoMovimiento, string> = {
  [ConceptoMovimiento.ALMUERZO]: 'almuerzo',
  [ConceptoMovimiento.MOVILIDAD]: 'movilidad',
  [ConceptoMovimiento.BONO]: 'bono',
  [ConceptoMovimiento.ADELANTO]: 'adelanto',
  [ConceptoMovimiento.PRESTAMO]: 'préstamo',
  [ConceptoMovimiento.OTRO]: 'otro',
};
