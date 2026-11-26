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
import { PagoFijo } from './pago-fijo.entity.js';
import { Prestamo } from './prestamo.entity.js';
import {
  ConceptoMovimiento,
  TipoMovimiento,
} from './tareo-movimiento.entity.js';

/** Adelanto, descuento o abono que se suma o resta al sueldo del periodo. */
@Entity('pagos_fijos_movimientos')
export class PagoFijoMovimiento extends EntidadBase {
  @Index()
  @Column({ name: 'pago_id', type: 'uuid' })
  pagoId: string;

  @ManyToOne(() => PagoFijo, (p) => p.movimientos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pago_id' })
  pago?: Relation<PagoFijo>;

  @Column({
    type: 'enum',
    enum: TipoMovimiento,
    enumName: 'tareo_movimientos_tipo_enum',
  })
  tipo: TipoMovimiento;

  @Column({
    type: 'enum',
    enum: ConceptoMovimiento,
    enumName: 'tareo_movimientos_concepto_enum',
  })
  concepto: ConceptoMovimiento;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numerico })
  monto: number;

  /** Día en que se le dio el adelanto (o del descuento). */
  @Column({ type: 'date', nullable: true })
  fecha: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  nota: string | null;

  /** Si es la cuota de un préstamo, cuál (igual que en el tareo). */
  @Index()
  @Column({ name: 'prestamo_id', type: 'uuid', nullable: true })
  prestamoId: string | null;

  @ManyToOne(() => Prestamo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'prestamo_id' })
  prestamo?: Relation<Prestamo>;
}
