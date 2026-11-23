import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { Usuario } from '../../../core/usuarios/entities/usuario.entity.js';
import { HallazgoVisita } from './hallazgo-visita.entity.js';
import { VisitaTecnica } from './visita-tecnica.entity.js';

/** A qué parte de la visita pertenece la foto. */
export enum SeccionFotoVisita {
  /** Personal con su equipo de protección personal. */
  EPP = 'EPP',
  /** Fachada de la vivienda o de la estación. */
  FACHADA = 'FACHADA',
  /** Croquis con las medidas (dibujo a mano fotografiado). */
  CROQUIS = 'CROQUIS',
  /** Foto de un ítem (va con `hallazgoId`). */
  HALLAZGO = 'HALLAZGO',
  /** Foto de un ítem con el flexómetro mostrando la medida (va con `hallazgoId`). */
  MEDIDA = 'MEDIDA',
}

/**
 * Foto de una visita técnica. Como en los informes, el archivo vive en el almacenamiento
 * (`clave`) y se sube directo con un enlace firmado; aquí queda el registro y su comentario.
 */
@Entity('fotos_visita')
export class FotoVisita extends EntidadBase {
  @Index()
  @Column({ name: 'visita_id', type: 'uuid' })
  visitaId: string;

  @ManyToOne(() => VisitaTecnica, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visita_id' })
  visita?: VisitaTecnica;

  @Column({ type: 'enum', enum: SeccionFotoVisita })
  seccion: SeccionFotoVisita;

  /** Ítem al que pertenece (secciones HALLAZGO y MEDIDA). */
  @Index()
  @Column({ name: 'hallazgo_id', type: 'uuid', nullable: true })
  hallazgoId: string | null;

  @ManyToOne(() => HallazgoVisita, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hallazgo_id' })
  hallazgo?: HallazgoVisita | null;

  /** Ruta del archivo dentro del almacenamiento. */
  @Column({ type: 'varchar', length: 300, unique: true })
  clave: string;

  @Column({ name: 'nombre_archivo', type: 'varchar', length: 200 })
  nombreArchivo: string;

  @Column({ name: 'tipo_contenido', type: 'varchar', length: 50 })
  tipoContenido: string;

  /** Tamaño real, leído al confirmar la subida. */
  @Column({ type: 'int', nullable: true })
  bytes: number | null;

  /** false hasta que se confirma que el archivo llegó; mientras tanto no se muestra. */
  @Column({ type: 'boolean', default: false })
  confirmada: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  comentario: string | null;

  @Column({ name: 'tomada_en', type: 'timestamptz', nullable: true })
  tomadaEn: Date | null;

  @Column({ name: 'subido_por_id', type: 'uuid' })
  subidoPorId: string;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subido_por_id' })
  subidoPor?: Usuario;
}
