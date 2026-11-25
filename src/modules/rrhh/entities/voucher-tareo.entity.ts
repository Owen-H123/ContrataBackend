import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  type Relation,
} from 'typeorm';
import { EntidadBase } from '../../../shared/entities/base.entity.js';
import { TareoFila } from './tareo-fila.entity.js';

/** Foto o PDF del voucher con que se pagó la semana de un trabajador. */
@Entity('vouchers_tareo')
export class VoucherTareo extends EntidadBase {
  @Index()
  @Column({ name: 'fila_id', type: 'uuid' })
  filaId: string;

  @ManyToOne(() => TareoFila, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fila_id' })
  fila?: Relation<TareoFila>;

  @Column({ type: 'varchar', length: 300 })
  clave: string;

  @Column({ name: 'nombre_archivo', type: 'varchar', length: 200 })
  nombreArchivo: string;

  @Column({ name: 'tipo_contenido', type: 'varchar', length: 60 })
  tipoContenido: string;

  @Column({ type: 'int', nullable: true })
  bytes: number | null;

  /** Hasta que se confirma que llegó, no se muestra. */
  @Column({ type: 'boolean', default: false })
  confirmado: boolean;

  @Column({ name: 'subido_por_id', type: 'uuid', nullable: true })
  subidoPorId: string | null;
}
