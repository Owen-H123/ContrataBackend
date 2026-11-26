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
import { PagoFijoMovimiento } from './pago-fijo-movimiento.entity.js';
import { MedioPago } from './tareo-fila.entity.js';
import { Trabajador } from './trabajador.entity.js';

/**
 * Pago del sueldo de un trabajador fijo en un periodo: una quincena (parte 1 = del 1 al 15,
 * parte 2 = del 16 a fin de mes) o el mes completo (parte 0).
 */
@Entity('pagos_fijos')
@Unique('uq_pago_fijo_periodo', ['trabajadorId', 'mes', 'parte'])
export class PagoFijo extends EntidadBase {
  @Index()
  @Column({ name: 'trabajador_id', type: 'uuid' })
  trabajadorId: string;

  @ManyToOne(() => Trabajador, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'trabajador_id' })
  trabajador?: Relation<Trabajador>;

  /** Mes del pago (AAAA-MM). */
  @Index()
  @Column({ type: 'varchar', length: 7 })
  mes: string;

  /** 0 = mes completo, 1 = primera quincena, 2 = segunda quincena. */
  @Column({ type: 'smallint' })
  parte: number;

  /** Sueldo del periodo; se copia de la ficha y se puede cambiar. */
  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numerico })
  sueldo: number;

  @Column({ type: 'boolean', default: false })
  retenido: boolean;

  @Column({ type: 'text', nullable: true })
  comentario: string | null;

  @Column({ name: 'pagado_en', type: 'date', nullable: true })
  pagadoEn: string | null;

  @Column({
    name: 'medio_pago',
    type: 'enum',
    enum: MedioPago,
    enumName: 'tareo_filas_medio_pago_enum',
    nullable: true,
  })
  medioPago: MedioPago | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  operacion: string | null;

  @OneToMany(() => PagoFijoMovimiento, (m) => m.pago)
  movimientos?: Relation<PagoFijoMovimiento>[];
}
