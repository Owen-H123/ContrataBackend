import {
  Column,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  Unique,
} from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { Usuario } from '../../../core/usuarios/entities/usuario.entity.js';
import { Sitio } from '../../../master/sitios/entities/sitio.entity.js';
import { OrdenCompra } from '../../../planning/ordenes-compra/entities/orden-compra.entity.js';

export enum EstadoInforme {
  /** Los técnicos están cargando evidencias. */
  EN_EJECUCION = 'EN_EJECUCION',
  /** Enviado a revisión; los técnicos ya no lo editan. */
  ENVIADO = 'ENVIADO',
  /** El revisor pidió correcciones; vuelve a ser editable. */
  OBSERVADO = 'OBSERVADO',
  /** Aprobado; queda cerrado. */
  APROBADO = 'APROBADO',
}

/** Estados en los que los técnicos pueden cargar o corregir información. */
export const ESTADOS_EDITABLES = [
  EstadoInforme.EN_EJECUCION,
  EstadoInforme.OBSERVADO,
];

/**
 * Informe de trabajo de una orden en un sitio (como el «Informe correctivo» de Sytex).
 * Reúne las actividades de esa orden en ese sitio y es lo que se envía y se aprueba.
 */
@Entity('informes')
@Unique(['ordenId', 'sitioId'])
export class Informe extends EntidadBase {
  @Column({ name: 'orden_id', type: 'uuid' })
  ordenId: string;

  @ManyToOne(() => OrdenCompra, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orden_id' })
  orden?: OrdenCompra;

  @Index()
  @Column({ name: 'sitio_id', type: 'uuid' })
  sitioId: string;

  @ManyToOne(() => Sitio, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sitio_id' })
  sitio?: Sitio;

  @Column({
    type: 'enum',
    enum: EstadoInforme,
    default: EstadoInforme.EN_EJECUCION,
  })
  estado: EstadoInforme;

  /** Ubicación tomada en campo por el técnico (sección «Ubicación del sitio»). */
  @Column({ type: 'double precision', nullable: true })
  latitud: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitud: number | null;

  /** Técnicos que pueden ver y cargar evidencias en este informe. */
  @ManyToMany(() => Usuario)
  @JoinTable({
    name: 'informes_tecnicos',
    joinColumn: { name: 'informe_id' },
    inverseJoinColumn: { name: 'usuario_id' },
  })
  tecnicos?: Usuario[];
}
