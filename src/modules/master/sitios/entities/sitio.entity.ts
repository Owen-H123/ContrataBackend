import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { Cliente } from '../../clientes/entities/cliente.entity.js';

/** Lugar donde se ejecuta el trabajo, por ejemplo la torre PE-03-AN-00595-15 DOS_ESTRELLAS. */
@Entity('sitios')
export class Sitio extends EntidadBase {
  /** Código del sitio tal como aparece en la orden de compra, en mayúsculas. */
  @Column({ type: 'varchar', length: 40, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  /**
   * Cliente dueño del sitio. null en los sitios que un técnico registró en una visita técnica
   * (la visita no lleva cliente); se asigna en Sitios antes de usarlo en una orden de compra.
   */
  @Index()
  @Column({ name: 'cliente_id', type: 'uuid', nullable: true })
  clienteId: string | null;

  @ManyToOne(() => Cliente, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  cliente?: Cliente | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  direccion: string | null;

  @Column({ type: 'double precision', nullable: true })
  latitud: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitud: number | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;
}
