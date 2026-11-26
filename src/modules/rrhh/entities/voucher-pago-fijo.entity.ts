import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  type Relation,
} from 'typeorm';
import { EntidadBase } from '../../../shared/entities/base.entity.js';
import { PagoFijo } from './pago-fijo.entity.js';

/** Foto o PDF del voucher con que se pagó el sueldo de un periodo (personal fijo). */
@Entity('vouchers_pago_fijo')
export class VoucherPagoFijo extends EntidadBase {
  @Index()
  @Column({ name: 'pago_id', type: 'uuid' })
  pagoId: string;

  @ManyToOne(() => PagoFijo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pago_id' })
  pago?: Relation<PagoFijo>;

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
