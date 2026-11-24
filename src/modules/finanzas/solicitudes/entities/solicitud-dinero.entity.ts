import {
  Column,
  Entity,
  Generated,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  type Relation,
} from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { numerico } from '../../../../shared/entities/numerico.transformer.js';
import { Usuario } from '../../../core/usuarios/entities/usuario.entity.js';
import { Sitio } from '../../../master/sitios/entities/sitio.entity.js';
import { ArchivoSolicitud } from './archivo-solicitud.entity.js';

/** Adelanto: se pide antes de gastar y luego se rinde. Reembolso: ya se gastó, con boletas. */
export enum TipoSolicitud {
  ADELANTO = 'ADELANTO',
  REEMBOLSO = 'REEMBOLSO',
}

/**
 * Recorrido: PENDIENTE → APROBADA o RECHAZADA → ABONADA → RENDIDA.
 * Un reembolso pasa directo a RENDIDA al abonarse (las boletas ya venían).
 */
export enum EstadoSolicitud {
  PENDIENTE = 'PENDIENTE',
  APROBADA = 'APROBADA',
  RECHAZADA = 'RECHAZADA',
  ABONADA = 'ABONADA',
  RENDIDA = 'RENDIDA',
}

export enum MedioAbono {
  TRANSFERENCIA = 'TRANSFERENCIA',
  YAPE_PLIN = 'YAPE_PLIN',
  EFECTIVO = 'EFECTIVO',
}

/** Solicitud de dinero (antes, el formulario «SOLICITUD DE DINERO - RYSCOM»). */
@Entity('solicitudes_dinero')
export class SolicitudDinero extends EntidadBase {
  /** Correlativo para nombrarla: SD-0001. */
  @Column({ type: 'int', unique: true })
  @Generated('increment')
  numero: number;

  /** Responsable de la solicitud: quien la envió. */
  @Index()
  @Column({ name: 'solicitante_id', type: 'uuid' })
  solicitanteId: string;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'solicitante_id' })
  solicitante?: Relation<Usuario>;

  /** DNI (8 dígitos) o RUC (11) de la persona a depositar. */
  @Column({ type: 'varchar', length: 11 })
  documento: string;

  /** Nombres y apellidos (o razón social) de la persona a depositar. */
  @Column({ type: 'varchar', length: 160 })
  beneficiario: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  banco: string | null;

  /** Número de cuenta o celular de Yape/Plin. */
  @Column({ type: 'varchar', length: 40 })
  cuenta: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numerico })
  monto: number;

  /** Lo que se aprobó; puede ser menos que lo pedido. */
  @Column({
    name: 'monto_aprobado',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numerico,
  })
  montoAprobado: number | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  concepto: string | null;

  @Column({
    type: 'enum',
    enum: TipoSolicitud,
    default: TipoSolicitud.ADELANTO,
  })
  tipo: TipoSolicitud;

  /** Centro de costo: un sitio (ID site)… */
  @Index()
  @Column({ name: 'sitio_id', type: 'uuid', nullable: true })
  sitioId: string | null;

  @ManyToOne(() => Sitio, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sitio_id' })
  sitio?: Relation<Sitio> | null;

  /** …o un centro de costo que no es sitio (Oficina, Almacén…). */
  @Column({ name: 'centro_costo', type: 'varchar', length: 60, nullable: true })
  centroCosto: string | null;

  /** Fecha de la solicitud. */
  @Index()
  @Column({ type: 'date' })
  fecha: string;

  @Index()
  @Column({
    type: 'enum',
    enum: EstadoSolicitud,
    default: EstadoSolicitud.PENDIENTE,
  })
  estado: EstadoSolicitud;

  @Column({ name: 'revisado_por_id', type: 'uuid', nullable: true })
  revisadoPorId: string | null;

  @ManyToOne(() => Usuario, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'revisado_por_id' })
  revisadoPor?: Relation<Usuario> | null;

  @Column({ name: 'revisado_en', type: 'timestamptz', nullable: true })
  revisadoEn: Date | null;

  /** Nota al aprobar o motivo del rechazo. */
  @Column({
    name: 'comentario_revision',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  comentarioRevision: string | null;

  @Column({ name: 'abonado_por_id', type: 'uuid', nullable: true })
  abonadoPorId: string | null;

  @ManyToOne(() => Usuario, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'abonado_por_id' })
  abonadoPor?: Relation<Usuario> | null;

  @Column({ name: 'abonado_en', type: 'date', nullable: true })
  abonadoEn: string | null;

  @Column({
    name: 'medio_abono',
    type: 'enum',
    enum: MedioAbono,
    nullable: true,
  })
  medioAbono: MedioAbono | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  operacion: string | null;

  @Column({ name: 'rendido_en', type: 'timestamptz', nullable: true })
  rendidoEn: Date | null;

  @OneToMany(() => ArchivoSolicitud, (a) => a.solicitud)
  archivos?: Relation<ArchivoSolicitud>[];
}
