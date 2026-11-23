import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { Usuario } from '../../../core/usuarios/entities/usuario.entity.js';
import { Sitio } from '../../../master/sitios/entities/sitio.entity.js';

export enum EstadoVisita {
  /** Registrada, todavía no se fue al sitio. */
  PENDIENTE = 'PENDIENTE',
  /** El técnico ya visitó el sitio. */
  VISITADO = 'VISITADO',
  /** No dejaron entrar al sitio. */
  ACCESO_RECHAZADO = 'ACCESO_RECHAZADO',
}

/**
 * Visita técnica: inspección de un sitio ANTES de cualquier trabajo, sin orden de compra.
 * La registra el propio técnico (el sitio puede ser uno existente o uno nuevo). Lleva fotos
 * fijas (EPP, fachada, croquis) y los hallazgos que el técnico va agregando, cada uno con
 * sus fotos, el posible correctivo y las medidas, para que el área de presupuestos cotice.
 */
@Entity('visitas_tecnicas')
export class VisitaTecnica extends EntidadBase {
  @Index()
  @Column({ name: 'sitio_id', type: 'uuid' })
  sitioId: string;

  @ManyToOne(() => Sitio, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sitio_id' })
  sitio?: Sitio;

  /** Técnico que hace la visita (quien la registró). Solo él y los ADMIN la editan. */
  @Index()
  @Column({ name: 'tecnico_id', type: 'uuid' })
  tecnicoId: string;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tecnico_id' })
  tecnico?: Usuario;

  /** Día de la visita (AAAA-MM-DD). */
  @Column({ type: 'date' })
  fecha: string;

  @Column({
    type: 'enum',
    enum: EstadoVisita,
    default: EstadoVisita.PENDIENTE,
  })
  estado: EstadoVisita;

  /** Notas generales de la visita. */
  @Column({ type: 'varchar', length: 2000, nullable: true })
  observaciones: string | null;

  @Column({ type: 'double precision', nullable: true })
  latitud: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitud: number | null;
}
