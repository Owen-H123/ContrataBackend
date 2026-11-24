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
import { Usuario } from '../../../core/usuarios/entities/usuario.entity.js';
import { SolicitudDinero } from './solicitud-dinero.entity.js';

/** Sustento: boleta o factura del gasto. Voucher: comprobante del depósito. */
export enum TipoArchivoSolicitud {
  SUSTENTO = 'SUSTENTO',
  VOUCHER = 'VOUCHER',
}

/** Foto o PDF adjunto a una solicitud de dinero. */
@Entity('archivos_solicitud')
export class ArchivoSolicitud extends EntidadBase {
  @Index()
  @Column({ name: 'solicitud_id', type: 'uuid' })
  solicitudId: string;

  @ManyToOne(() => SolicitudDinero, (s) => s.archivos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'solicitud_id' })
  solicitud?: Relation<SolicitudDinero>;

  @Column({ type: 'enum', enum: TipoArchivoSolicitud })
  tipo: TipoArchivoSolicitud;

  @Column({ type: 'varchar', length: 300 })
  clave: string;

  @Column({ name: 'nombre_archivo', type: 'varchar', length: 200 })
  nombreArchivo: string;

  @Column({ name: 'tipo_contenido', type: 'varchar', length: 60 })
  tipoContenido: string;

  @Column({ type: 'int', nullable: true })
  bytes: number | null;

  /** Hasta que se confirma, el archivo no se muestra ni cuenta. */
  @Column({ type: 'boolean', default: false })
  confirmado: boolean;

  /** Monto de la boleta, para comparar lo gastado con lo recibido. */
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numerico,
  })
  monto: number | null;

  @Column({ name: 'subido_por_id', type: 'uuid', nullable: true })
  subidoPorId: string | null;

  @ManyToOne(() => Usuario, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'subido_por_id' })
  subidoPor?: Relation<Usuario> | null;
}
