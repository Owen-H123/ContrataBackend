import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { Usuario } from '../../../core/usuarios/entities/usuario.entity.js';
import { Informe } from './informe.entity.js';

export enum AccionRevision {
  /** El técnico terminó la ejecución. */
  FINALIZADO = 'FINALIZADO',
  /** Se volvió a abrir para seguir cargando fotos o ítems. */
  REABIERTO = 'REABIERTO',
}

/** Historial del informe: cada cierre y reapertura de la ejecución, con quién y cuándo. */
@Entity('revisiones_informe')
export class RevisionInforme extends EntidadBase {
  @Index()
  @Column({ name: 'informe_id', type: 'uuid' })
  informeId: string;

  @ManyToOne(() => Informe, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'informe_id' })
  informe?: Informe;

  @Column({ type: 'enum', enum: AccionRevision })
  accion: AccionRevision;

  /** Motivo, por ejemplo al reabrir: qué falta. */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  comentario: string | null;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  usuario?: Usuario;
}
