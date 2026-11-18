import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { Cliente } from '../../../master/clientes/entities/cliente.entity.js';
import { ItemOrden } from './item-orden.entity.js';

export enum EstadoOrden {
  /** Se puede editar y se está ejecutando. */
  ABIERTA = 'ABIERTA',
  /** Trabajo terminado; los ítems ya no cambian. */
  CERRADA = 'CERRADA',
  /** El cliente la dejó sin efecto. */
  ANULADA = 'ANULADA',
}

/** Orden de compra emitida por un cliente, por ejemplo la 4500154399 de Sites del Perú. */
@Entity('ordenes_compra')
@Unique(['clienteId', 'numero'])
export class OrdenCompra extends EntidadBase {
  /**
   * Número tal como figura en el documento del cliente. Único por cliente.
   * null = «Orden pendiente»: la orden llegó sin número y se completa al editarla.
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  numero: string | null;

  @Column({ name: 'cliente_id', type: 'uuid' })
  clienteId: string;

  @ManyToOne(() => Cliente, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  cliente?: Cliente;

  /** Fecha del documento, en formato AAAA-MM-DD. */
  @Column({ name: 'fecha_emision', type: 'date' })
  fechaEmision: string;

  /** Código ISO de la moneda (PEN, USD). */
  @Column({ type: 'varchar', length: 3, default: 'PEN' })
  moneda: string;

  @Column({ type: 'enum', enum: EstadoOrden, default: EstadoOrden.ABIERTA })
  estado: EstadoOrden;

  @Column({ type: 'varchar', length: 500, nullable: true })
  observaciones: string | null;

  @OneToMany(() => ItemOrden, (item) => item.orden, { cascade: ['insert'] })
  items?: ItemOrden[];
}
