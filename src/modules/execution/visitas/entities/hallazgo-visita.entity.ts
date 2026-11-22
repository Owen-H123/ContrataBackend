import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { numerico } from '../../../../shared/entities/numerico.transformer.js';
import { VisitaTecnica } from './visita-tecnica.entity.js';

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

  /** Medidas del área afectada, en metros (opcionales). */
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
