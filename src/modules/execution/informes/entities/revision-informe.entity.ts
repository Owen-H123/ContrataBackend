import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { Usuario } from '../../../core/usuarios/entities/usuario.entity.js';
import { Informe } from './informe.entity.js';

export enum AccionRevision {
  ENVIADO = 'ENVIADO',
  APROBADO = 'APROBADO',
  OBSERVADO = 'OBSERVADO',
}

/** Historial del informe: cada envío, aprobación u observación, con quién y cuándo. */
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

  /** Obligatorio al observar: qué hay que corregir. */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  comentario: string | null;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  usuario?: Usuario;
}
