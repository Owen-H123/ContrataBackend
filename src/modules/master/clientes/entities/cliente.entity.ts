import { Column, Entity } from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';

/** Empresa que emite las órdenes de compra (por ejemplo, Sites del Perú). */
@Entity('clientes')
export class Cliente extends EntidadBase {
  @Column({ name: 'razon_social', type: 'varchar', length: 160 })
  razonSocial: string;

  /** RUC de 11 dígitos; identifica al cliente de forma única. */
  @Column({ type: 'varchar', length: 11, unique: true })
  ruc: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;
}
