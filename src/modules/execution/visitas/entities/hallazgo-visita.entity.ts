import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { numerico } from '../../../../shared/entities/numerico.transformer.js';
import { VisitaTecnica } from './visita-tecnica.entity.js';

/** Unidad en la que se anotan las medidas del ítem. */
export enum UnidadMedida {
  M = 'M',
  CM = 'CM',
  MM = 'MM',
}

/**
 * Ítem de la visita (el «posible correctivo» de Sytex; en el código, «hallazgo»): lo crea el
 * técnico por cada problema que encuentra. Ejemplo: «Techo en mal estado» → «Requiere cambio
 * de calamina», con sus fotos, sus fotos con flexómetro y las medidas (largo, ancho, alto).
 */
@Entity('hallazgos_visita')
export class HallazgoVisita extends EntidadBase {
  @Index()
  @Column({ name: 'visita_id', type: 'uuid' })
  visitaId: string;

  @ManyToOne(() => VisitaTecnica, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visita_id' })
  visita?: VisitaTecnica;

  /** Orden en la visita: 1, 2, 3… */
  @Column({ type: 'int' })
  posicion: number;

  /** Anomalía encontrada, p. ej. «Drywall en mal estado». */
  @Column({ type: 'varchar', length: 300 })
  descripcion: string;

  /** Posible correctivo necesario, p. ej. «Requiere cambio de drywall». */
  @Column({ type: 'varchar', length: 500, nullable: true })
  correctivo: string | null;

  /**
   * Si el ítem lleva medidas. Se pregunta al crearlo: sin medidas no se piden largo, ancho,
   * alto ni fotos con flexómetro.
   */
  @Column({ name: 'con_medidas', type: 'boolean', default: false })
  conMedidas: boolean;

  /** Unidad de largo, ancho y alto (metros, centímetros o milímetros). */
  @Column({ type: 'enum', enum: UnidadMedida, default: UnidadMedida.M })
  unidad: UnidadMedida;

  /** Medidas del área afectada, en la unidad del ítem (opcionales). */
  @Column({
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
    transformer: numerico,
  })
  largo: number | null;

  @Column({
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
    transformer: numerico,
  })
  ancho: number | null;

  @Column({
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
    transformer: numerico,
  })
  alto: number | null;

  /** Comentarios y otras medidas o detalles. */
  @Column({ type: 'varchar', length: 2000, nullable: true })
  comentario: string | null;
}
