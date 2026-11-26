import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  type Relation,
} from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { numerico } from '../../../../shared/entities/numerico.transformer.js';
import { Trabajo } from './trabajo.entity.js';

/** Cada versión del presupuesto enviada al cliente (antes, columnas REV, REV1, REV2…). */
@Entity('revisiones_presupuesto')
export class RevisionPresupuesto extends EntidadBase {
  @Index()
  @Column({ name: 'trabajo_id', type: 'uuid' })
  trabajoId: string;

  @ManyToOne(() => Trabajo, (t) => t.revisiones, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trabajo_id' })
  trabajo?: Relation<Trabajo>;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numerico })
  monto: number;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  nota: string | null;
}
