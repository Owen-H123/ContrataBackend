import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { EtapaEvidencia } from '../../../../shared/enums/etapa-evidencia.enum.js';
import { Usuario } from '../../../core/usuarios/entities/usuario.entity.js';
import { ItemOrden } from '../../../planning/ordenes-compra/entities/item-orden.entity.js';
import { Informe } from '../../informes/entities/informe.entity.js';

export enum TipoEvidencia {
  /** Foto de un trabajo (ítem de la orden) en una etapa: antes, durante o finalizado. */
  ACTIVIDAD = 'ACTIVIDAD',
  /** Foto del personal con su equipo de protección personal. Obligatoria. */
  EPP = 'EPP',
  /** Foto panorámica de la torre completa, al llegar a la estación. */
  PANORAMICA = 'PANORAMICA',
  /** Foto de las estaciones y equipos, al llegar a la estación. */
  ESTACION = 'ESTACION',
}

/**
 * Una foto del informe. El archivo vive en R2 (`clave`); aquí queda quién la subió,
 * cuándo, a qué corresponde y su comentario.
 *
 * Nunca se borra: «quitar» una foto solo la oculta (`ocultaEn`), y el archivo se conserva.
 */
@Entity('evidencias')
export class Evidencia extends EntidadBase {
  @Index()
  @Column({ name: 'informe_id', type: 'uuid' })
  informeId: string;

  @ManyToOne(() => Informe, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'informe_id' })
  informe?: Informe;

  @Column({ type: 'enum', enum: TipoEvidencia })
  tipo: TipoEvidencia;

  /** Actividad a la que pertenece (solo tipo ACTIVIDAD). */
  @Index()
  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  @ManyToOne(() => ItemOrden, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'item_id' })
  item?: ItemOrden | null;

  /** Etapa de la actividad (solo tipo ACTIVIDAD). */
  @Column({ type: 'enum', enum: EtapaEvidencia, nullable: true })
  etapa: EtapaEvidencia | null;

  /** Técnico que aparece en la foto (solo tipo EPP, opcional). */
  @Column({ name: 'tecnico_id', type: 'uuid', nullable: true })
  tecnicoId: string | null;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tecnico_id' })
  tecnico?: Usuario | null;

  /** Ruta del archivo dentro del bucket de R2. */
  @Column({ type: 'varchar', length: 300, unique: true })
  clave: string;

  /** Nombre del archivo en el celular, para descargarlo con un nombre reconocible. */
  @Column({ name: 'nombre_archivo', type: 'varchar', length: 200 })
  nombreArchivo: string;

  @Column({ name: 'tipo_contenido', type: 'varchar', length: 50 })
  tipoContenido: string;

  /** Tamaño real, leído de R2 al confirmar la subida. */
  @Column({ type: 'int', nullable: true })
  bytes: number | null;

  /** false hasta que se confirma que el archivo llegó a R2; mientras tanto no se muestra. */
  @Column({ type: 'boolean', default: false })
  confirmada: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  comentario: string | null;

  /** Momento en que se tomó la foto, según el celular. */
  @Column({ name: 'tomada_en', type: 'timestamptz', nullable: true })
  tomadaEn: Date | null;

  @Column({ name: 'subido_por_id', type: 'uuid' })
  subidoPorId: string;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subido_por_id' })
  subidoPor?: Usuario;

  /** Si tiene fecha, la foto está oculta (quitada del informe, pero conservada). */
  @Column({ name: 'oculta_en', type: 'timestamptz', nullable: true })
  ocultaEn: Date | null;

  @Column({ name: 'oculta_por_id', type: 'uuid', nullable: true })
  ocultaPorId: string | null;

  @ManyToOne(() => Usuario, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'oculta_por_id' })
  ocultaPor?: Usuario | null;
}
