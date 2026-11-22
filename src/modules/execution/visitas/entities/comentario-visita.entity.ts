import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { Usuario } from '../../../core/usuarios/entities/usuario.entity.js';
import { EstadoVisita, VisitaTecnica } from './visita-tecnica.entity.js';

/**
 * Conversación e historial de la visita, en orden de llegada: comentarios escritos y, cuando
 * cambia el estado, una constancia automática con el estado nuevo (`estado`).
 */
@Entity('comentarios_visita')
export class ComentarioVisita extends EntidadBase {
  @Index()
  @Column({ name: 'visita_id', type: 'uuid' })
  visitaId: string;

  @ManyToOne(() => VisitaTecnica, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visita_id' })
  visita?: VisitaTecnica;

  /** Texto escrito; en una constancia de estado, el motivo opcional. */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  texto: string | null;

  /** Solo en las constancias: el estado al que pasó la visita. */
  @Column({ type: 'enum', enum: EstadoVisita, nullable: true })
  estado: EstadoVisita | null;

  @Column({ name: 'autor_id', type: 'uuid' })
  autorId: string;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'autor_id' })
  autor?: Usuario;
}
