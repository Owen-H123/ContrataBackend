import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { numerico } from '../../../../shared/entities/numerico.transformer.js';
import { EtapaEvidencia } from '../../../../shared/enums/etapa-evidencia.enum.js';
import { Sitio } from '../../../master/sitios/entities/sitio.entity.js';
import { OrdenCompra } from './orden-compra.entity.js';

/**
 * Una línea de la orden de compra. Es la actividad que el técnico ejecuta y documenta,
 * por ejemplo «CAMBIO CABLE VIDA C/ SUMINISTRO — 33 M».
 */
@Entity('items_orden')
@Unique(['ordenId', 'posicion'])
export class ItemOrden extends EntidadBase {
  @Column({ name: 'orden_id', type: 'uuid' })
  ordenId: string;

  @ManyToOne(() => OrdenCompra, (orden) => orden.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orden_id' })
  orden?: OrdenCompra;

  /** Posición en la orden (10, 20, 30…). Única dentro de la orden. */
  @Column({ type: 'int' })
  posicion: number;

  /** Sitio donde se ejecuta esta línea; debe pertenecer al cliente de la orden. */
  @Index()
  @Column({ name: 'sitio_id', type: 'uuid' })
  sitioId: string;

  @ManyToOne(() => Sitio, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sitio_id' })
  sitio?: Sitio;

  /** Código de material o servicio del cliente (por ejemplo 4001078). */
  @Column({
    name: 'codigo_material',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  codigoMaterial: string | null;

  /** Texto corto de la línea, el que se ve en la lista de actividades. */
  @Column({ type: 'varchar', length: 300 })
  descripcion: string;

  /** Descripción larga del servicio, si el documento la trae. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  detalle: string | null;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 3,
    transformer: numerico,
  })
  cantidad: number;

  /** Unidad de medida tal como viene en la orden: M, UND, M2, KG, D, M3, SER… */
  @Column({ type: 'varchar', length: 10 })
  unidad: string;

  @Column({
    name: 'precio_unitario',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numerico,
  })
  precioUnitario: number;

  @Column({ name: 'fecha_entrega', type: 'date', nullable: true })
  fechaEntrega: string | null;

  /**
   * Etapas con fotos que exige esta actividad. Vacío = no lleva fotos
   * (por ejemplo «Transporte y desplazamiento»).
   */
  @Column({ type: 'enum', enum: EtapaEvidencia, array: true })
  etapas: EtapaEvidencia[];
}
