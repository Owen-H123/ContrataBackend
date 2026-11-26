import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  type Relation,
  Unique,
} from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { numerico } from '../../../../shared/entities/numerico.transformer.js';
import { Cliente } from '../../../master/clientes/entities/cliente.entity.js';
import { Trabajo } from '../../../planning/trabajos/entities/trabajo.entity.js';
import { PagoComprobante } from './pago-comprobante.entity.js';

/** Venta: la emite RYSCOM a un cliente. Compra: la recibe RYSCOM de un proveedor (o un gasto). */
export enum TipoComprobante {
  VENTA = 'VENTA',
  COMPRA = 'COMPRA',
}

export enum ClaseComprobante {
  FACTURA = 'FACTURA',
  BOLETA = 'BOLETA',
  RECIBO_HONORARIOS = 'RECIBO_HONORARIOS',
  NOTA_CREDITO = 'NOTA_CREDITO',
  TICKET = 'TICKET',
  OTRO = 'OTRO',
}

/** En qué se gastó (solo compras), para ver los gastos por rubro. */
export enum CategoriaGasto {
  MATERIALES = 'MATERIALES',
  SERVICIOS = 'SERVICIOS',
  TRANSPORTE = 'TRANSPORTE',
  COMBUSTIBLE = 'COMBUSTIBLE',
  ALIMENTACION = 'ALIMENTACION',
  HOSPEDAJE = 'HOSPEDAJE',
  HERRAMIENTAS = 'HERRAMIENTAS',
  ALQUILER = 'ALQUILER',
  OFICINA = 'OFICINA',
  IMPUESTOS = 'IMPUESTOS',
  OTROS = 'OTROS',
}

const monto = (name: string, nullable = false) =>
  Column({
    name,
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numerico,
    nullable,
    default: nullable ? undefined : 0,
  }) as PropertyDecorator;

/** Factura, boleta o recibo, de venta o de compra, con sus cobros o pagos. */
@Entity('comprobantes')
@Unique('uq_comprobante', ['tipo', 'contraparteDocumento', 'serie', 'numero'])
export class Comprobante extends EntidadBase {
  @Index()
  @Column({ type: 'enum', enum: TipoComprobante })
  tipo: TipoComprobante;

  @Column({
    type: 'enum',
    enum: ClaseComprobante,
    default: ClaseComprobante.FACTURA,
  })
  clase: ClaseComprobante;

  /** «E001», «F001», «B001». */
  @Column({ type: 'varchar', length: 10 })
  serie: string;

  @Column({ type: 'varchar', length: 20 })
  numero: string;

  @Index()
  @Column({ name: 'fecha_emision', type: 'date' })
  fechaEmision: string;

  @Column({ name: 'fecha_vencimiento', type: 'date', nullable: true })
  fechaVencimiento: string | null;

  /** Ventas: el cliente registrado en el sistema. */
  @Index()
  @Column({ name: 'cliente_id', type: 'uuid', nullable: true })
  clienteId: string | null;

  @ManyToOne(() => Cliente, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  cliente?: Relation<Cliente> | null;

  /** RUC (11) o DNI (8) del cliente o proveedor. */
  @Column({ name: 'contraparte_documento', type: 'varchar', length: 11 })
  contraparteDocumento: string;

  @Column({ name: 'contraparte_nombre', type: 'varchar', length: 160 })
  contraparteNombre: string;

  @Column({ type: 'varchar', length: 3, default: 'PEN' })
  moneda: string;

  /** Soles por dólar, si es en dólares. */
  @Column({
    name: 'tipo_cambio',
    type: 'numeric',
    precision: 8,
    scale: 4,
    nullable: true,
    transformer: numerico,
  })
  tipoCambio: number | null;

  /** Valor sin IGV. */
  @monto('base_imponible')
  baseImponible: number;

  @monto('igv')
  igv: number;

  /** Montos sin IGV (exonerado, inafecto). */
  @monto('no_gravado')
  noGravado: number;

  @monto('total')
  total: number;

  @Column({ type: 'enum', enum: CategoriaGasto, nullable: true })
  categoria: CategoriaGasto | null;

  @Column({ type: 'varchar', length: 300 })
  descripcion: string;

  /** Trabajo del seguimiento al que corresponde (para saber cuánto dejó cada uno). */
  @Index()
  @Column({ name: 'trabajo_id', type: 'uuid', nullable: true })
  trabajoId: string | null;

  @ManyToOne(() => Trabajo, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'trabajo_id' })
  trabajo?: Relation<Trabajo> | null;

  /** Si no es de un trabajo: «Oficina», «Movilidad general»… */
  @Column({ name: 'centro_costo', type: 'varchar', length: 80, nullable: true })
  centroCosto: string | null;

  @Column({ type: 'boolean', default: false })
  anulado: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  nota: string | null;

  @Column({ name: 'registrado_por_id', type: 'uuid', nullable: true })
  registradoPorId: string | null;

  @OneToMany(() => PagoComprobante, (p) => p.comprobante)
  pagos?: Relation<PagoComprobante>[];
}
