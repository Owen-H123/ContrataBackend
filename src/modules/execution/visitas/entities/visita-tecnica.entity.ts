import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { Usuario } from '../../../core/usuarios/entities/usuario.entity.js';
import { Sitio } from '../../../master/sitios/entities/sitio.entity.js';
import { OrdenCompra } from '../../../planning/ordenes-compra/entities/orden-compra.entity.js';

export enum EstadoVisita {
  /** El técnico está registrando la visita: puede editar, subir fotos y comentar. */
  EN_CURSO = 'EN_CURSO',
  /** El técnico la terminó; se avisa al admin, que puede reabrirla. */
  FINALIZADA = 'FINALIZADA',
}

/** Para qué fue el técnico al sitio. */
export enum MotivoVisita {
  INSPECCION = 'INSPECCION',
  LEVANTAMIENTO = 'LEVANTAMIENTO',
  MANTENIMIENTO_PREVENTIVO = 'MANTENIMIENTO_PREVENTIVO',
  MANTENIMIENTO_CORRECTIVO = 'MANTENIMIENTO_CORRECTIVO',
  EMERGENCIA = 'EMERGENCIA',
  OTRO = 'OTRO',
}

/**
 * Visita técnica: la registra el propio técnico (a diferencia del informe, que abre el admin).
 * Va asociada a una orden de compra y a un sitio de esa orden; lleva fecha, motivo,
 * observaciones, ubicación, fotos y comentarios.
 */
@Entity('visitas_tecnicas')
export class VisitaTecnica extends EntidadBase {
  @Index()
  @Column({ name: 'orden_id', type: 'uuid' })
  ordenId: string;

  @ManyToOne(() => OrdenCompra, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orden_id' })
  orden?: OrdenCompra;

  @Index()
  @Column({ name: 'sitio_id', type: 'uuid' })
  sitioId: string;

  @ManyToOne(() => Sitio, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sitio_id' })
  sitio?: Sitio;

  /** Técnico que hizo la visita (quien la registró). Solo él y los ADMIN la editan. */
  @Index()
  @Column({ name: 'tecnico_id', type: 'uuid' })
  tecnicoId: string;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tecnico_id' })
  tecnico?: Usuario;

  /** Día de la visita (AAAA-MM-DD). */
  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'enum', enum: MotivoVisita })
  motivo: MotivoVisita;

  /** Lo que encontró o hizo el técnico. */
  @Column({ type: 'varchar', length: 2000, nullable: true })
  observaciones: string | null;

  @Column({ type: 'enum', enum: EstadoVisita, default: EstadoVisita.EN_CURSO })
  estado: EstadoVisita;

  @Column({ type: 'double precision', nullable: true })
  latitud: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitud: number | null;
}
