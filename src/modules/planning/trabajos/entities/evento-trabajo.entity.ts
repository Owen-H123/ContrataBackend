import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  type Relation,
} from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { Trabajo } from './trabajo.entity.js';

/** Línea del historial del trabajo: cambios de etapa, revisiones y comentarios. */
@Entity('eventos_trabajo')
export class EventoTrabajo extends EntidadBase {
  @Index()
  @Column({ name: 'trabajo_id', type: 'uuid' })
  trabajoId: string;

  @ManyToOne(() => Trabajo, (t) => t.eventos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trabajo_id' })
  trabajo?: Relation<Trabajo>;

  /** COMENTARIO, o la etapa/hito que cambió (ENVIADO, APROBADO, REVISION…). */
  @Column({ type: 'varchar', length: 30 })
  tipo: string;

  @Column({ type: 'varchar', length: 500 })
  texto: string;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId: string | null;

  @Column({
    name: 'usuario_nombre',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  usuarioNombre: string | null;
}
