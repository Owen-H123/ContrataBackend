import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  type Relation,
} from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { Comprobante } from './comprobante.entity.js';

/** PDF o foto de la factura o boleta (y del voucher de su pago, si se quiere). */
@Entity('archivos_comprobante')
export class ArchivoComprobante extends EntidadBase {
  @Index()
  @Column({ name: 'comprobante_id', type: 'uuid' })
  comprobanteId: string;

  @ManyToOne(() => Comprobante, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comprobante_id' })
  comprobante?: Relation<Comprobante>;

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
