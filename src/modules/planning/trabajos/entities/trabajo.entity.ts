import {
  Column,
  Entity,
  Generated,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  type Relation,
} from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { numerico } from '../../../../shared/entities/numerico.transformer.js';
import { Cliente } from '../../../master/clientes/entities/cliente.entity.js';
import { Sitio } from '../../../master/sitios/entities/sitio.entity.js';
import { OrdenCompra } from '../../ordenes-compra/entities/orden-compra.entity.js';
import { EventoTrabajo } from './evento-trabajo.entity.js';
import { RevisionPresupuesto } from './revision-presupuesto.entity.js';

/** Tipo de trabajo (antes, cada uno en su hoja del Excel de control). */
export enum AreaTrabajo {
  CORRECTIVO = 'CORRECTIVO',
  PREVENTIVO = 'PREVENTIVO',
  ACCESO = 'ACCESO',
  INGENIERIA = 'INGENIERIA',
  FACTIBILIDAD = 'FACTIBILIDAD',
  OTRO = 'OTRO',
}

export enum Criticidad {
  CRITICO = 'CRITICO',
  NO_CRITICO = 'NO_CRITICO',
}

/**
 * En qué va el trabajo. No se escribe a mano: sale del último hito con fecha
 * (ver `calcularEtapa`), para que nunca quede desactualizada.
 */
export enum EtapaTrabajo {
  SOLICITADO = 'SOLICITADO',
  ENVIADO = 'ENVIADO',
  REVISADO = 'REVISADO',
  APROBADO = 'APROBADO',
  CON_OC = 'CON_OC',
  EN_EJECUCION = 'EN_EJECUCION',
  EJECUTADO = 'EJECUTADO',
  ACTA = 'ACTA',
  FACTURADO = 'FACTURADO',
  COBRADO = 'COBRADO',
  CANCELADO = 'CANCELADO',
}

/** Por qué se cerró sin terminar. */
export enum MotivoCancelacion {
  ANULADO = 'ANULADO',
  RECHAZADO = 'RECHAZADO',
  NO_APLICA = 'NO_APLICA',
}

const fecha = (name: string) =>
  Column({ name, type: 'date', nullable: true }) as PropertyDecorator;
const monto = (name: string) =>
  Column({
    name,
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numerico,
  }) as PropertyDecorator;
const texto = (name: string, length: number) =>
  Column({
    name,
    type: 'varchar',
    length,
    nullable: true,
  }) as PropertyDecorator;

/**
 * Un trabajo para un cliente en un sitio, desde que piden el presupuesto hasta que se cobra
 * (antes, una fila en «PPT SOLICITADOS» y otra en «CORRECTIVOS EJECUTADOS»).
 */
@Entity('trabajos')
export class Trabajo extends EntidadBase {
  /** Correlativo para nombrarlo: TR-0001. */
  @Column({ type: 'int', unique: true })
  @Generated('increment')
  numero: number;

  @Index()
  @Column({ name: 'cliente_id', type: 'uuid' })
  clienteId: string;

  @ManyToOne(() => Cliente, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  cliente?: Relation<Cliente>;

  @Index()
  @Column({ name: 'sitio_id', type: 'uuid' })
  sitioId: string;

  @ManyToOne(() => Sitio, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sitio_id' })
  sitio?: Relation<Sitio>;

  @Column({ type: 'varchar', length: 500 })
  descripcion: string;

  @Index()
  @Column({ type: 'enum', enum: AreaTrabajo, default: AreaTrabajo.CORRECTIVO })
  area: AreaTrabajo;

  @Column({ type: 'enum', enum: Criticidad, nullable: true })
  criticidad: Criticidad | null;

  /** Quién arma el presupuesto (p. ej. Ricardo, Carol). */
  @texto('encargado', 60)
  encargado: string | null;

  /** Presupuesto vigente (el de la última revisión). */
  @monto('monto')
  monto: number | null;

  @Index()
  @Column({
    type: 'enum',
    enum: EtapaTrabajo,
    default: EtapaTrabajo.SOLICITADO,
  })
  etapa: EtapaTrabajo;

  // ---------- Hitos ----------

  /** Cuándo pidieron el presupuesto. También fija el año del trabajo. */
  @Index()
  @Column({ name: 'solicitado_en', type: 'date' })
  solicitadoEn: string;

  @fecha('enviado_en')
  enviadoEn: string | null;

  /** El cliente lo revisó (p. ej. «Revisado SDP PERÚ»). */
  @fecha('revisado_en')
  revisadoEn: string | null;

  @fecha('aprobado_en')
  aprobadoEn: string | null;

  /** Quién lo aprobó: SDP Perú, LATAM, compras… */
  @texto('aprobado_por', 60)
  aprobadoPor: string | null;

  /** Orden de compra del cliente, si ya está en el sistema. */
  @Index()
  @Column({ name: 'orden_id', type: 'uuid', nullable: true })
  ordenId: string | null;

  @ManyToOne(() => OrdenCompra, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'orden_id' })
  orden?: Relation<OrdenCompra> | null;

  /** Número de OC escrito a mano (cuando la OC aún no está en el sistema). */
  @texto('oc_numero', 20)
  ocNumero: string | null;

  @fecha('oc_en')
  ocEn: string | null;

  @fecha('ejecucion_inicio')
  ejecucionInicio: string | null;

  @fecha('ejecutado_en')
  ejecutadoEn: string | null;

  /** Responsable del acta de aceptación (EA) del lado del cliente. */
  @texto('ea_responsable', 60)
  eaResponsable: string | null;

  @fecha('ea_solicitada_en')
  eaSolicitadaEn: string | null;

  @fecha('ea_aprobada_en')
  eaAprobadaEn: string | null;

  @texto('factura_numero', 20)
  facturaNumero: string | null;

  @fecha('facturado_en')
  facturadoEn: string | null;

  /** Lo facturado (puede ser una parte: 80 %, 50 %). */
  @monto('monto_facturado')
  montoFacturado: number | null;

  @fecha('cobrado_en')
  cobradoEn: string | null;

  @monto('monto_cobrado')
  montoCobrado: number | null;

  @Column({ type: 'enum', enum: MotivoCancelacion, nullable: true })
  cancelado: MotivoCancelacion | null;

  @fecha('cancelado_en')
  canceladoEn: string | null;

  @Column({ type: 'text', nullable: true })
  comentario: string | null;

  /** Algo que revisar (p. ej. al importar del Excel no se encontró su presupuesto). */
  @Column({ type: 'varchar', length: 300, nullable: true })
  observacion: string | null;

  /** Hoja y fila del Excel de donde vino; permite volver a importar sin duplicar. */
  @Index()
  @Column({
    name: 'importado_de',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  importadoDe: string | null;

  @OneToMany(() => RevisionPresupuesto, (r) => r.trabajo)
  revisiones?: Relation<RevisionPresupuesto>[];

  @OneToMany(() => EventoTrabajo, (e) => e.trabajo)
  eventos?: Relation<EventoTrabajo>[];
}

/** La etapa sale del último hito con fecha. */
export function calcularEtapa(
  t: Pick<
    Trabajo,
    | 'cancelado'
    | 'cobradoEn'
    | 'facturadoEn'
    | 'eaAprobadaEn'
    | 'ejecutadoEn'
    | 'ejecucionInicio'
    | 'ordenId'
    | 'ocNumero'
    | 'aprobadoEn'
    | 'revisadoEn'
    | 'enviadoEn'
  >,
): EtapaTrabajo {
  if (t.cancelado) return EtapaTrabajo.CANCELADO;
  if (t.cobradoEn) return EtapaTrabajo.COBRADO;
  if (t.facturadoEn) return EtapaTrabajo.FACTURADO;
  if (t.eaAprobadaEn) return EtapaTrabajo.ACTA;
  if (t.ejecutadoEn) return EtapaTrabajo.EJECUTADO;
  if (t.ejecucionInicio) return EtapaTrabajo.EN_EJECUCION;
  if (t.ordenId || t.ocNumero) return EtapaTrabajo.CON_OC;
  if (t.aprobadoEn) return EtapaTrabajo.APROBADO;
  if (t.revisadoEn) return EtapaTrabajo.REVISADO;
  if (t.enviadoEn) return EtapaTrabajo.ENVIADO;
  return EtapaTrabajo.SOLICITADO;
}
