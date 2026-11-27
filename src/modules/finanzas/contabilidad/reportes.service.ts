import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import { In, IsNull, Not, type ObjectLiteral, Repository } from 'typeorm';
import { redondear2 } from '../../../shared/entities/numerico.transformer.js';
import {
  EtapaTrabajo,
  Trabajo,
} from '../../planning/trabajos/entities/trabajo.entity.js';
import { codigoTrabajo } from '../../planning/trabajos/trabajos.service.js';
import { PagoFijo } from '../../rrhh/entities/pago-fijo.entity.js';
import { TareoFila } from '../../rrhh/entities/tareo-fila.entity.js';
import { calcularPago } from '../../rrhh/sueldos-fijos.service.js';
import { calcularFila } from '../../rrhh/tareo.service.js';
import {
  EstadoSolicitud,
  NOMBRE_TIPO_SOLICITUD,
  SolicitudDinero,
} from '../solicitudes/entities/solicitud-dinero.entity.js';
import { calcularComprobante, enSoles } from './contabilidad.service.js';
import { Comprobante, TipoComprobante } from './entities/comprobante.entity.js';
import { PagoComprobante } from './entities/pago-comprobante.entity.js';
import { ArchivoComprobante } from './entities/archivo-comprobante.entity.js';
import {
  ArchivoSolicitud,
  TipoArchivoSolicitud,
} from '../solicitudes/entities/archivo-solicitud.entity.js';
import { VoucherTareo } from '../../rrhh/entities/voucher-tareo.entity.js';
import { VoucherPagoFijo } from '../../rrhh/entities/voucher-pago-fijo.entity.js';
import { StorageService } from '../../../services/storage/storage.service.js';
import { conEnlaces } from '../../../shared/archivos/adjuntos.js';

/** De dónde sale cada pago que hace RYSCOM. */
export type OrigenPago = 'TAREO' | 'SUELDO_FIJO' | 'SOLICITUD' | 'PROVEEDOR';

export interface PagoUnificado {
  origen: OrigenPago;
  /** Id del registro de origen (fila del tareo, pago fijo, solicitud o comprobante). */
  id: string;
  fecha: string;
  monto: number;
  aQuien: string;
  concepto: string;
  medio: string | null;
  operacion: string | null;
  /** Sitio o trabajo al que corresponde, si se sabe. */
  proyecto: string | null;
  comprobante: string | null;
  /** Voucher o comprobante del pago (fotos o PDF), con su enlace de descarga. */
  archivos?: {
    id: string;
    nombreArchivo: string;
    tipoContenido: string;
    url: string | null;
  }[];
}

const NOMBRE_PARTE = ['mes', '1.ª quincena', '2.ª quincena'];
const finDeMes = (mes: string) =>
  `${mes}-${String(new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`;

@Injectable()
export class ReportesService {
  constructor(
    @InjectRepository(Comprobante)
    private readonly comprobantes: Repository<Comprobante>,
    @InjectRepository(PagoComprobante)
    private readonly pagosComprobante: Repository<PagoComprobante>,
    @InjectRepository(TareoFila)
    private readonly filas: Repository<TareoFila>,
    @InjectRepository(PagoFijo)
    private readonly pagosFijos: Repository<PagoFijo>,
    @InjectRepository(SolicitudDinero)
    private readonly solicitudes: Repository<SolicitudDinero>,
    @InjectRepository(Trabajo)
    private readonly trabajos: Repository<Trabajo>,
    @InjectRepository(VoucherTareo)
    private readonly vouchersTareo: Repository<VoucherTareo>,
    @InjectRepository(VoucherPagoFijo)
    private readonly vouchersFijo: Repository<VoucherPagoFijo>,
    @InjectRepository(ArchivoSolicitud)
    private readonly archivosSolicitud: Repository<ArchivoSolicitud>,
    @InjectRepository(ArchivoComprobante)
    private readonly archivosComprobante: Repository<ArchivoComprobante>,
    private readonly storage: StorageService,
  ) {}

  /** Pone en cada pago su voucher o comprobante, según de dónde viene. */
  private async adjuntar(pagos: PagoUnificado[]) {
    const ids = (o: OrigenPago) =>
      pagos.filter((p) => p.origen === o).map((p) => p.id);
    const buscar = <T extends ObjectLiteral>(
      repo: Repository<T>,
      campo: string,
      lista: string[],
      extra = {},
    ) =>
      lista.length
        ? repo.find({
            where: { [campo]: In(lista), confirmado: true, ...extra } as never,
            order: { creadoEn: 'ASC' } as never,
          })
        : Promise.resolve([] as T[]);
    const [tareo, fijos, solicitudes, comprobantes] = await Promise.all([
      buscar(this.vouchersTareo, 'filaId', ids('TAREO')),
      buscar(this.vouchersFijo, 'pagoId', ids('SUELDO_FIJO')),
      buscar(this.archivosSolicitud, 'solicitudId', ids('SOLICITUD'), {
        tipo: TipoArchivoSolicitud.VOUCHER,
      }),
      buscar(this.archivosComprobante, 'comprobanteId', ids('PROVEEDOR')),
    ]);
    const todos = [
      ...tareo.map((a) => ({ padre: a.filaId, a })),
      ...fijos.map((a) => ({ padre: a.pagoId, a })),
      ...solicitudes.map((a) => ({ padre: a.solicitudId, a })),
      ...comprobantes.map((a) => ({ padre: a.comprobanteId, a })),
    ];
    const enlaces = await conEnlaces(
      this.storage,
      todos.map((t) => t.a),
    );
    for (const p of pagos)
      p.archivos = enlaces.filter((_, i) => todos[i].padre === p.id);
  }

  /** Todo lo que RYSCOM pagó en el mes: planilla, sueldos, solicitudes y proveedores. */
  async pagos(mes: string): Promise<{
    pagos: PagoUnificado[];
    totales: Record<OrigenPago | 'TOTAL', number>;
  }> {
    const desde = `${mes}-01`;
    const hasta = finDeMes(mes);
    const entre = { desde, hasta };

    const [tareo, fijos, solicitudes, proveedores] = await Promise.all([
      this.filas
        .createQueryBuilder('f')
        .leftJoinAndSelect('f.trabajador', 'trabajador')
        .leftJoinAndSelect('f.movimientos', 'movimientos')
        .where('f.pagado_en BETWEEN :desde AND :hasta', entre)
        .getMany(),
      this.pagosFijos
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.trabajador', 'trabajador')
        .leftJoinAndSelect('p.movimientos', 'movimientos')
        .where('p.pagado_en BETWEEN :desde AND :hasta', entre)
        .getMany(),
      this.solicitudes
        .createQueryBuilder('s')
        .leftJoinAndSelect('s.sitio', 'sitio')
        .leftJoinAndSelect('s.trabajo', 'trabajo')
        .where('s.abonado_en BETWEEN :desde AND :hasta', entre)
        .andWhere('s.estado IN (:...estados)', {
          estados: [EstadoSolicitud.ABONADA, EstadoSolicitud.RENDIDA],
        })
        .getMany(),
      this.pagosComprobante
        .createQueryBuilder('p')
        .innerJoinAndSelect('p.comprobante', 'c')
        .leftJoinAndSelect('c.trabajo', 'trabajo')
        .leftJoinAndSelect('trabajo.sitio', 'sitio')
        .where('p.fecha BETWEEN :desde AND :hasta', entre)
        .andWhere('c.tipo = :tipo', { tipo: TipoComprobante.COMPRA })
        .andWhere('c.anulado = false')
        .getMany(),
    ]);

    const pagos: PagoUnificado[] = [
      ...tareo.map((f) => {
        const c = calcularFila(f);
        return {
          origen: 'TAREO' as const,
          id: f.id,
          fecha: f.pagadoEn!,
          monto: c.total,
          aQuien: f.trabajador?.nombres ?? '—',
          concepto: `Tareo, semana del ${f.semana.slice(8, 10)}/${f.semana.slice(5, 7)} (${c.totalDias} días)`,
          medio: f.medioPago,
          operacion: f.operacion,
          proyecto: null,
          comprobante: null,
        };
      }),
      ...fijos.map((p) => {
        const c = calcularPago(p);
        return {
          origen: 'SUELDO_FIJO' as const,
          id: p.id,
          fecha: p.pagadoEn!,
          monto: c.total,
          aQuien: p.trabajador?.nombres ?? '—',
          concepto: `Sueldo, ${NOMBRE_PARTE[p.parte]} de ${p.mes}`,
          medio: p.medioPago,
          operacion: p.operacion,
          proyecto: null,
          comprobante: null,
        };
      }),
      ...solicitudes.map((s) => ({
        origen: 'SOLICITUD' as const,
        id: s.id,
        fecha: s.abonadoEn!,
        monto: s.montoAprobado ?? s.monto,
        aQuien: s.beneficiario,
        concepto: `${NOMBRE_TIPO_SOLICITUD[s.tipo]} SD-${String(s.numero).padStart(4, '0')}${s.concepto ? `: ${s.concepto}` : ''}`,
        medio: s.medioAbono,
        operacion: s.operacion,
        proyecto: s.trabajo
          ? `${codigoTrabajo(s.trabajo.numero)} ${s.sitio?.nombre ?? ''}`.trim()
          : s.sitio
            ? `${s.sitio.codigo} ${s.sitio.nombre}`
            : s.centroCosto,
        comprobante: null,
      })),
      ...proveedores.map((p) => ({
        origen: 'PROVEEDOR' as const,
        id: p.comprobante!.id,
        fecha: p.fecha,
        monto: enSoles(p.comprobante!, p.monto),
        aQuien: p.comprobante!.contraparteNombre,
        concepto: p.comprobante!.descripcion,
        medio: p.medio,
        operacion: p.operacion,
        proyecto: p.comprobante!.trabajo
          ? `${codigoTrabajo(p.comprobante!.trabajo.numero)} ${p.comprobante!.trabajo.sitio?.nombre ?? ''}`.trim()
          : p.comprobante!.centroCosto,
        comprobante: `${p.comprobante!.serie}-${p.comprobante!.numero}`,
      })),
    ].sort((a, b) => b.fecha.localeCompare(a.fecha));
    await this.adjuntar(pagos);

    const suma = (o?: OrigenPago) =>
      redondear2(
        pagos
          .filter((p) => !o || p.origen === o)
          .reduce((s, p) => s + p.monto, 0),
      );
    return {
      pagos,
      totales: {
        TAREO: suma('TAREO'),
        SUELDO_FIJO: suma('SUELDO_FIJO'),
        SOLICITUD: suma('SOLICITUD'),
        PROVEEDOR: suma('PROVEEDOR'),
        TOTAL: suma(),
      },
    };
  }

  /** Lo que Summer necesita ver de un vistazo, para el mes y lo pendiente a la fecha. */
  async panel(mes: string) {
    const [ventas, compras, cobrosMes, trabajosPendientes, pagosMes] =
      await Promise.all([
        this.comprobantes.find({
          where: { tipo: TipoComprobante.VENTA, anulado: false },
          relations: { pagos: true },
        }),
        this.comprobantes.find({
          where: { tipo: TipoComprobante.COMPRA, anulado: false },
          relations: { pagos: true, trabajo: { sitio: true } },
        }),
        this.pagosComprobante
          .createQueryBuilder('p')
          .innerJoinAndSelect('p.comprobante', 'c')
          .where("TO_CHAR(p.fecha, 'YYYY-MM') = :mes", { mes })
          .andWhere('c.tipo = :tipo', { tipo: TipoComprobante.VENTA })
          .andWhere('c.anulado = false')
          .getMany(),
        this.trabajos.find({
          where: {
            etapa: In([EtapaTrabajo.EJECUTADO, EtapaTrabajo.ACTA]),
          },
        }),
        this.pagos(mes),
      ]);
    const v = ventas.map(calcularComprobante);
    const c = compras.map(calcularComprobante);
    const sumar = <T>(xs: T[], f: (x: T) => number) =>
      redondear2(xs.reduce((s, x) => s + f(x), 0));
    const delMes = <T extends { fechaEmision: string }>(xs: T[]) =>
      xs.filter((x) => x.fechaEmision.startsWith(mes));

    // Gastos por rubro del mes.
    const porCategoria = new Map<string, number>();
    for (const x of delMes(c))
      porCategoria.set(
        x.categoria ?? 'OTROS',
        redondear2(
          (porCategoria.get(x.categoria ?? 'OTROS') ?? 0) +
            enSoles(x, x.baseImponible + x.noGravado),
        ),
      );

    return {
      mes,
      pendiente: {
        porCobrar: sumar(v, (x) => x.saldoSoles),
        porCobrarVencido: sumar(
          v.filter((x) => x.vencido),
          (x) => x.saldoSoles,
        ),
        facturasPorCobrar: v.filter((x) => x.saldo > 0).length,
        porFacturar: sumar(trabajosPendientes, (t) => t.monto ?? 0),
        trabajosPorFacturar: trabajosPendientes.length,
        porPagar: sumar(c, (x) => x.saldoSoles),
        porPagarVencido: sumar(
          c.filter((x) => x.vencido),
          (x) => x.saldoSoles,
        ),
      },
      delMes: {
        facturado: sumar(delMes(v), (x) => x.totalSoles),
        facturadoSinIgv: sumar(delMes(v), (x) =>
          enSoles(x, x.baseImponible + x.noGravado),
        ),
        cobrado: sumar(cobrosMes, (p) => enSoles(p.comprobante!, p.monto)),
        gastos: sumar(delMes(c), (x) => x.totalSoles),
        gastosPorCategoria: [...porCategoria]
          .map(([categoria, monto]) => ({ categoria, monto }))
          .sort((a, b) => b.monto - a.monto),
        pagos: pagosMes.totales,
        planilla: redondear2(
          pagosMes.totales.TAREO + pagosMes.totales.SUELDO_FIJO,
        ),
      },
      porTrabajo: await this.porTrabajo(mes.slice(0, 4)),
    };
  }

  /** Cuánto dejó cada trabajo del año: lo facturado menos lo gastado (sin IGV). */
  async porTrabajo(anio: string) {
    const comps = await this.comprobantes.find({
      where: { trabajoId: Not(IsNull()), anulado: false },
      relations: { trabajo: { sitio: true } },
    });
    const mapa = new Map<
      string,
      { trabajo: Trabajo; ingresos: number; gastos: number }
    >();
    for (const x of comps) {
      if (!x.trabajo || !x.fechaEmision.startsWith(anio)) continue;
      const fila = mapa.get(x.trabajo.id) ?? {
        trabajo: x.trabajo,
        ingresos: 0,
        gastos: 0,
      };
      const base = enSoles(x, x.baseImponible + x.noGravado);
      if (x.tipo === TipoComprobante.VENTA) fila.ingresos += base;
      else fila.gastos += base;
      mapa.set(x.trabajo.id, fila);
    }
    // Lo abonado por solicitudes de dinero cargadas al trabajo también es gasto.
    const solicitudes = await this.solicitudes.find({
      where: {
        trabajoId: Not(IsNull()),
        estado: In([EstadoSolicitud.ABONADA, EstadoSolicitud.RENDIDA]),
      },
      relations: { trabajo: { sitio: true } },
    });
    for (const s of solicitudes) {
      if (!s.trabajo || !s.abonadoEn?.startsWith(anio)) continue;
      const fila = mapa.get(s.trabajo.id) ?? {
        trabajo: s.trabajo,
        ingresos: 0,
        gastos: 0,
      };
      fila.gastos += s.montoAprobado ?? s.monto;
      mapa.set(s.trabajo.id, fila);
    }
    return [...mapa.values()]
      .map(({ trabajo, ingresos, gastos }) => ({
        id: trabajo.id,
        codigo: codigoTrabajo(trabajo.numero),
        sitio: trabajo.sitio?.nombre ?? '',
        descripcion: trabajo.descripcion,
        ingresos: redondear2(ingresos),
        gastos: redondear2(gastos),
        resultado: redondear2(ingresos - gastos),
      }))
      .sort((a, b) => b.ingresos + b.gastos - (a.ingresos + a.gastos))
      .slice(0, 50);
  }

  /** Excel del mes para el contador: registro de ventas, de compras y todos los pagos. */
  async excel(mes: string) {
    const [ventas, compras, pagos] = await Promise.all([
      this.comprobantes.find({
        where: { tipo: TipoComprobante.VENTA },
        relations: { pagos: true, trabajo: { sitio: true } },
        order: { fechaEmision: 'ASC', serie: 'ASC', numero: 'ASC' },
      }),
      this.comprobantes.find({
        where: { tipo: TipoComprobante.COMPRA },
        relations: { pagos: true, trabajo: { sitio: true } },
        order: { fechaEmision: 'ASC' },
      }),
      this.pagos(mes),
    ]);
    const libro = new ExcelJS.Workbook();
    libro.creator = 'Contrata RYSCOM';
    const soles = '#,##0.00';
    const estilo = (h: ExcelJS.Worksheet, anchos: number[]) => {
      h.columns.forEach((c, i) => (c.width = anchos[i] ?? 14));
      const t = h.getRow(1);
      t.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      t.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF217346' },
      };
      t.alignment = { vertical: 'middle', wrapText: true };
      t.height = 30;
      h.views = [{ state: 'frozen', ySplit: 1 }];
    };

    const registro = (
      nombre: string,
      lista: Comprobante[],
      compra: boolean,
    ) => {
      const h = libro.addWorksheet(nombre);
      h.addRow([
        'Fecha',
        'Vence',
        'Tipo',
        'Serie',
        'Número',
        compra ? 'RUC/DNI proveedor' : 'RUC cliente',
        compra ? 'Proveedor' : 'Cliente',
        'Moneda',
        'T. cambio',
        'Base imponible',
        'IGV',
        'No gravado',
        'Total',
        'Total en S/',
        compra ? 'Pagado' : 'Cobrado',
        'Saldo',
        'Estado',
        ...(compra ? ['Rubro'] : []),
        'Trabajo',
        'Detalle',
      ]);
      const delMes = lista
        .filter((x) => x.fechaEmision.startsWith(mes))
        .map(calcularComprobante);
      for (const x of delMes) {
        const anulado = x.estado === 'ANULADO';
        h.addRow([
          new Date(`${x.fechaEmision}T12:00:00`),
          x.fechaVencimiento
            ? new Date(`${x.fechaVencimiento}T12:00:00`)
            : null,
          x.clase,
          x.serie,
          x.numero,
          x.contraparteDocumento,
          x.contraparteNombre,
          x.moneda,
          x.tipoCambio,
          anulado ? 0 : x.baseImponible,
          anulado ? 0 : x.igv,
          anulado ? 0 : x.noGravado,
          anulado ? 0 : x.total,
          anulado ? 0 : x.totalSoles,
          anulado ? 0 : x.pagado,
          anulado ? 0 : x.saldo,
          x.estado,
          ...(compra ? [x.categoria ?? ''] : []),
          x.trabajo
            ? `${x.trabajo.codigo} ${x.trabajo.sitio?.nombre ?? ''}`
            : (x.centroCosto ?? ''),
          x.descripcion,
        ]);
      }
      const n = delMes.length;
      const fila = h.addRow([
        'TOTAL',
        ...Array(8).fill(null),
        ...['J', 'K', 'L', 'M', 'N', 'O', 'P'].map((col) => ({
          formula: `SUM(${col}2:${col}${n + 1})`,
        })),
      ]);
      fila.font = { bold: true };
      ['A', 'B'].forEach((c) => (h.getColumn(c).numFmt = 'dd/mm/yyyy'));
      ['J', 'K', 'L', 'M', 'N', 'O', 'P'].forEach(
        (c) => (h.getColumn(c).numFmt = soles),
      );
      estilo(
        h,
        [
          11, 11, 10, 7, 10, 13, 34, 7, 8, 13, 11, 11, 13, 13, 13, 13, 11, 16,
          26, 40,
        ],
      );
    };
    registro('Registro de ventas', ventas, false);
    registro('Registro de compras', compras, true);

    const h = libro.addWorksheet('Pagos del mes');
    h.addRow([
      'Fecha',
      'Tipo',
      'A quién',
      'Concepto',
      'Monto S/',
      'Medio',
      'Operación',
      'Trabajo / sitio',
      'Comprobante',
    ]);
    const nombreOrigen: Record<OrigenPago, string> = {
      TAREO: 'Planilla (tareo)',
      SUELDO_FIJO: 'Sueldo fijo',
      SOLICITUD: 'Solicitud de dinero',
      PROVEEDOR: 'Proveedor',
    };
    for (const p of [...pagos.pagos].reverse())
      h.addRow([
        new Date(`${p.fecha}T12:00:00`),
        nombreOrigen[p.origen],
        p.aQuien,
        p.concepto,
        p.monto,
        p.medio,
        p.operacion,
        p.proyecto,
        p.comprobante,
      ]);
    const t = h.addRow([
      'TOTAL',
      null,
      null,
      null,
      { formula: `SUM(E2:E${pagos.pagos.length + 1})` },
    ]);
    t.font = { bold: true };
    h.getColumn('A').numFmt = 'dd/mm/yyyy';
    h.getColumn('E').numFmt = soles;
    estilo(h, [11, 18, 32, 44, 13, 15, 14, 28, 14]);

    return Buffer.from(await libro.xlsx.writeBuffer());
  }
}
