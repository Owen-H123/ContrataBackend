import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { Usuario } from '../../usuarios/entities/usuario.entity.js';

export enum TipoNotificacion {
  /** Al técnico: le asignaron un informe. */
  INFORME_ASIGNADO = 'INFORME_ASIGNADO',
  /** A administradores y supervisores: un técnico terminó la ejecución. */
  INFORME_FINALIZADO = 'INFORME_FINALIZADO',
  /** A los técnicos: se reabrió el informe, con lo que falta. */
  INFORME_REABIERTO = 'INFORME_REABIERTO',
  /** Al autor: un administrador descartó una de sus fotos. */
  FOTO_DESCARTADA = 'FOTO_DESCARTADA',
  /** Cambió el estado de una visita técnica (visitado, acceso rechazado…): al admin o al técnico. */
  VISITA_ESTADO = 'VISITA_ESTADO',
  /** Comentario nuevo en una visita técnica (al técnico o a los admin). */
  VISITA_COMENTARIO = 'VISITA_COMENTARIO',
}

/**
 * Aviso para un usuario. Se guarda un registro por destinatario, así cada quien
 * lleva su propio historial y su propio «leído».
 */
@Entity('notificaciones')
@Index(['usuarioId', 'leidaEn', 'creadoEn'])
export class Notificacion extends EntidadBase {
  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario?: Usuario;

  @Column({ type: 'enum', enum: TipoNotificacion })
  tipo: TipoNotificacion;

  @Column({ type: 'varchar', length: 160 })
  titulo: string;

  @Column({ type: 'varchar', length: 400, nullable: true })
  detalle: string | null;

  /** Informe al que lleva el aviso; no es una relación para no atar el historial a él. */
  @Column({ name: 'informe_id', type: 'uuid', nullable: true })
  informeId: string | null;

  /** Visita técnica a la que lleva el aviso (en vez de un informe). */
  @Column({ name: 'visita_id', type: 'uuid', nullable: true })
  visitaId: string | null;

  /** null mientras no se lee. */
  @Column({ name: 'leida_en', type: 'timestamptz', nullable: true })
  leidaEn: Date | null;
}
