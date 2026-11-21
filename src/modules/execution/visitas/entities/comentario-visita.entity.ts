import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { Usuario } from '../../../core/usuarios/entities/usuario.entity.js';
import { VisitaTecnica } from './visita-tecnica.entity.js';

export enum TipoComentarioVisita {
  /** Mensaje escrito por el técnico o el admin. */
  COMENTARIO = 'COMENTARIO',
  /** Constancia automática: el técnico finalizó la visita. */
  FINALIZADA = 'FINALIZADA',
  /** Constancia automática: el admin la reabrió (con el motivo, si lo dio). */
  REABIERTA = 'REABIERTA',
}

/** Conversación e historial de la visita, en orden de llegada. */
@Entity('comentarios_visita')
export class ComentarioVisita extends EntidadBase {
  @Index()
  @Column({ name: 'visita_id', type: 'uuid' })
  visitaId: string;

  @ManyToOne(() => VisitaTecnica, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visita_id' })
  visita?: VisitaTecnica;

  @Column({
    type: 'enum',
    enum: TipoComentarioVisita,
    default: TipoComentarioVisita.COMENTARIO,
  })
  tipo: TipoComentarioVisita;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  texto: string | null;

  @Column({ name: 'autor_id', type: 'uuid' })
  autorId: string;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'autor_id' })
  autor?: Usuario;
}
