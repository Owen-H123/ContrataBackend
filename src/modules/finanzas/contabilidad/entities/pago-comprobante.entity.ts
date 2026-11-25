import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  type Relation,
} from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { numerico } from '../../../../shared/entities/numerico.transformer.js';
import { Comprobante } from './comprobante.entity.js';

/**
 * Cómo se pagó (o cobró) una parte del comprobante. La detracción (Banco de la Nación) y la
 * retención también cuentan como «pago», así el saldo cuadra con lo que llega al banco.
 */
export enum MedioPagoComprobante {
  TRANSFERENCIA = 'TRANSFERENCIA',
  DEPOSITO = 'DEPOSITO',
  EFECTIVO = 'EFECTIVO',
  YAPE_PLIN = 'YAPE_PLIN',
  CHEQUE = 'CHEQUE',
  DETRACCION = 'DETRACCION',
  RETENCION = 'RETENCION',
  OTRO = 'OTRO',
}

/** Un cobro (en ventas) o un pago (en compras) de un comprobante. */
@Entity('pagos_comprobante')
export class PagoComprobante extends EntidadBase {
  @Index()
  @Column({ name: 'comprobante_id', type: 'uuid' })
  comprobanteId: string;

  @ManyToOne(() => Comprobante, (c) => c.pagos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comprobante_id' })
  comprobante?: Relation<Comprobante>;

  @Index()
  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numerico })
  monto: number;

  @Column({ type: 'enum', enum: MedioPagoComprobante })
  medio: MedioPagoComprobante;

  @Column({ type: 'varchar', length: 60, nullable: true })
  operacion: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  nota: string | null;

  @Column({ name: 'registrado_por_id', type: 'uuid', nullable: true })
  registradoPorId: string | null;
}
