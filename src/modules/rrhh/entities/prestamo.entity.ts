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
import { Trabajador } from './trabajador.entity.js';

/**
 * Préstamo a un trabajador que se le va descontando del tareo semana a semana.
 * El saldo no se guarda: es el monto menos los descuentos del tareo enlazados a él.
 */
@Entity('prestamos')
export class Prestamo extends EntidadBase {
  @Index()
  @Column({ name: 'trabajador_id', type: 'uuid' })
  trabajadorId: string;

  @ManyToOne(() => Trabajador, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'trabajador_id' })
  trabajador?: Relation<Trabajador>;

  /** Día en que se le entregó el dinero (AAAA-MM-DD). */
  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numerico })
  monto: number;

  /** Cuánto se le descuenta cada semana que aparece en el tareo. */
  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numerico })
  cuota: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  nota: string | null;

  @Column({ name: 'registrado_por_id', type: 'uuid', nullable: true })
  registradoPorId: string | null;
}
