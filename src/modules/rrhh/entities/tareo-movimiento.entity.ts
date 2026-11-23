import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  type Relation,
} from 'typeorm';
import { EntidadBase } from '../../../shared/entities/base.entity.js';
import { numerico } from '../../../shared/entities/numerico.transformer.js';
import { TareoFila } from './tareo-fila.entity.js';

/** Suma o resta al pago de la semana. */
export enum TipoMovimiento {
  ABONO = 'ABONO',
  DESCUENTO = 'DESCUENTO',
}

/** Motivo del abono o descuento (antes iba como «=50+50+50» o en comentarios). */
export enum ConceptoMovimiento {
  ALMUERZO = 'ALMUERZO',
  MOVILIDAD = 'MOVILIDAD',
  BONO = 'BONO',
  ADELANTO = 'ADELANTO',
  PRESTAMO = 'PRESTAMO',
  OTRO = 'OTRO',
}

/** Un abono o descuento de una fila del tareo, con su concepto y monto. */
@Entity('tareo_movimientos')
export class TareoMovimiento extends EntidadBase {
  @Index()
  @Column({ name: 'fila_id', type: 'uuid' })
  filaId: string;

  @ManyToOne(() => TareoFila, (f) => f.movimientos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fila_id' })
  fila?: Relation<TareoFila>;

  @Column({ type: 'enum', enum: TipoMovimiento })
  tipo: TipoMovimiento;

  @Column({ type: 'enum', enum: ConceptoMovimiento })
  concepto: ConceptoMovimiento;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numerico })
  monto: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  nota: string | null;
}
