import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  type Relation,
  Unique,
} from 'typeorm';
import { EntidadBase } from '../../../shared/entities/base.entity.js';
import { numerico } from '../../../shared/entities/numerico.transformer.js';
import { TareoMovimiento } from './tareo-movimiento.entity.js';
import { Trabajador } from './trabajador.entity.js';

/** Cómo se le pagó la semana. */
export enum MedioPago {
  TRANSFERENCIA = 'TRANSFERENCIA',
  YAPE_PLIN = 'YAPE_PLIN',
  EFECTIVO = 'EFECTIVO',
}

/**
 * Una fila del tareo: un trabajador en una semana (domingo a sábado), con los días que
 * trabajó, su pago por día de esa semana, y si ya se le pagó.
 */
@Entity('tareo_filas')
@Unique('uq_tareo_semana_trabajador', ['semana', 'trabajadorId'])
export class TareoFila extends EntidadBase {
  /** Domingo con que empieza la semana (AAAA-MM-DD). */
  @Index()
  @Column({ type: 'date' })
  semana: string;

  @Index()
  @Column({ name: 'trabajador_id', type: 'uuid' })
  trabajadorId: string;

  @ManyToOne(() => Trabajador, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'trabajador_id' })
  trabajador?: Trabajador;

  /** Cargo en esa semana (puede no ser el habitual). */
  @Column({ type: 'varchar', length: 60 })
  cargo: string;

  /** Pago por día en esa semana; se copia de la ficha y se puede cambiar. */
  @Column({
    name: 'pago_dia',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: numerico,
  })
  pagoDia: number;

  /** Días trabajados de domingo [0] a sábado [6]. */
  @Column({ type: 'boolean', array: true, default: () => "'{f,f,f,f,f,f,f}'" })
  dias: boolean[];

  /** «No abonar»: el pago de esta semana queda retenido (por ejemplo, falta información). */
  @Column({ type: 'boolean', default: false })
  retenido: boolean;

  @Column({ type: 'text', nullable: true })
  comentario: string | null;

  /** Fecha en que se le pagó la semana; null mientras no se paga. */
  @Column({ name: 'pagado_en', type: 'date', nullable: true })
  pagadoEn: string | null;

  @Column({ name: 'medio_pago', type: 'enum', enum: MedioPago, nullable: true })
  medioPago: MedioPago | null;

  /** Número de operación o nota del pago. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  operacion: string | null;

  @OneToMany(() => TareoMovimiento, (m) => m.fila)
  movimientos?: Relation<TareoMovimiento>[];
}
