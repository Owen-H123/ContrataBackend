import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { redondear2 } from '../../shared/entities/numerico.transformer.js';
import type {
  AgregarFilaDto,
  CrearMovimientoDto,
  EditarFilaDto,
  PagarFilaDto,
} from './dto/rrhh.schema.js';
import { TareoFila } from './entities/tareo-fila.entity.js';
import {
  ConceptoMovimiento,
  TareoMovimiento,
  TipoMovimiento,
} from './entities/tareo-movimiento.entity.js';
import { Trabajador } from './entities/trabajador.entity.js';
import { VoucherTareo } from './entities/voucher-tareo.entity.js';
import { StorageService } from '../../services/storage/storage.service.js';

/** Voucher en foto o PDF, hasta 10 MB; máximo 3 por semana de cada trabajador. */
export const TIPOS_VOUCHER = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
} as const;
const MAX_BYTES_VOUCHER = 10 * 1024 * 1024;
const MAX_VOUCHERS = 3;

/** Suma días a una fecha AAAA-MM-DD (en UTC, sin problemas de zona horaria). */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Domingo de la semana a la que pertenece la fecha. */
export function domingoDe(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  return sumarDias(fecha, -d.getUTCDay());
}

/** Una fila con sus cuentas hechas, como la ve la pantalla del tareo. */
export function calcularFila(f: TareoFila) {
  const movimientos = [...(f.movimientos ?? [])].sort(
    (a, b) => a.creadoEn.getTime() - b.creadoEn.getTime(),
  );
  const totalDias = f.dias.filter(Boolean).length;
  const subtotal = redondear2(totalDias * f.pagoDia);
  const sumar = (tipo: TipoMovimiento) =>
    redondear2(
      movimientos
        .filter((m) => m.tipo === tipo)
        .reduce((s, m) => s + m.monto, 0),
    );
  const abonos = sumar(TipoMovimiento.ABONO);
  const descuentos = sumar(TipoMovimiento.DESCUENTO);
  return {
    id: f.id,
    semana: f.semana,
    trabajador: f.trabajador && {
      id: f.trabajador.id,
      nombres: f.trabajador.nombres,
      dni: f.trabajador.dni,
      tipo: f.trabajador.tipo,
    },
    cargo: f.cargo,
    pagoDia: f.pagoDia,
    dias: f.dias,
    totalDias,
    subtotal,
    abonos,
    descuentos,
    total: redondear2(subtotal + abonos - descuentos),
    retenido: f.retenido,
    comentario: f.comentario,
    pagadoEn: f.pagadoEn,
    medioPago: f.medioPago,
    operacion: f.operacion,
    movimientos: movimientos.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      concepto: m.concepto,
      monto: m.monto,
      nota: m.nota,
    })),
  };
}

@Injectable()
export class TareoService {
  constructor(
    @InjectRepository(TareoFila)
    private readonly filas: Repository<TareoFila>,
    @InjectRepository(TareoMovimiento)
    private readonly movimientos: Repository<TareoMovimiento>,
    @InjectRepository(Trabajador)
    private readonly trabajadores: Repository<Trabajador>,
    @InjectRepository(VoucherTareo)
    private readonly vouchers: Repository<VoucherTareo>,
    private readonly storage: StorageService,
  ) {}

  /** La semana completa: sus 7 fechas, las filas y los totales. */
  async semana(semana: string) {
    const filas = await this.filas.find({
      where: { semana },
      relations: { trabajador: true, movimientos: true },
      order: { trabajador: { nombres: 'ASC' } },
    });
    const vouchers = filas.length
      ? await this.vouchers.find({
          where: { filaId: In(filas.map((f) => f.id)), confirmado: true },
          order: { creadoEn: 'ASC' },
        })
      : [];
    const enlaces = await Promise.all(
      vouchers.map(async (v) => ({
        id: v.id,
        filaId: v.filaId,
        nombreArchivo: v.nombreArchivo,
        tipoContenido: v.tipoContenido,
        url: this.storage.configurado
          ? await this.storage.urlParaDescargar(v.clave)
          : null,
      })),
    );
    const calculadas = filas.map((f) => ({
      ...calcularFila(f),
      vouchers: enlaces
        .filter((v) => v.filaId === f.id)
        .map(({ filaId: _f, ...v }) => v),
    }));
    const suma = (k: 'subtotal' | 'abonos' | 'descuentos' | 'total') =>
      redondear2(calculadas.reduce((s, f) => s + f[k], 0));
    return {
      semana,
      fechas: Array.from({ length: 7 }, (_, i) => sumarDias(semana, i)),
      filas: calculadas,
      totales: {
        trabajadores: calculadas.length,
        dias: calculadas.reduce((s, f) => s + f.totalDias, 0),
        subtotal: suma('subtotal'),
        abonos: suma('abonos'),
        descuentos: suma('descuentos'),
        total: suma('total'),
        pagado: redondear2(
          calculadas.filter((f) => f.pagadoEn).reduce((s, f) => s + f.total, 0),
        ),
        porPagar: redondear2(
          calculadas
            .filter((f) => !f.pagadoEn && !f.retenido)
            .reduce((s, f) => s + f.total, 0),
        ),
        retenido: redondear2(
          calculadas
            .filter((f) => f.retenido && !f.pagadoEn)
            .reduce((s, f) => s + f.total, 0),
        ),
      },
    };
  }

  /** Agrega trabajadores a la semana con su cargo y pago por día de la ficha. Ignora los que ya están. */
  async agregar(dto: AgregarFilaDto) {
    const trabajadores = await this.trabajadores.findBy({
      id: In(dto.trabajadorIds),
    });
    if (trabajadores.length !== new Set(dto.trabajadorIds).size)
      throw new NotFoundException('Algún trabajador no existe');
    const ya = new Set(
      (
        await this.filas.find({
          where: { semana: dto.semana },
          select: { trabajadorId: true },
        })
      ).map((f) => f.trabajadorId),
    );
    const nuevas = trabajadores
      .filter((t) => !ya.has(t.id))
      .map((t) =>
        this.filas.create({
          semana: dto.semana,
          trabajadorId: t.id,
          cargo: t.cargo,
          pagoDia: t.pagoDia ?? 0,
          dias: [false, false, false, false, false, false, false],
        }),
      );
    if (nuevas.length) await this.filas.save(nuevas);
    return this.semana(dto.semana);
  }

  /** Trae a la semana el mismo personal de la semana anterior (sin días marcados). */
  async copiarAnterior(semana: string) {
    const anterior = await this.filas.find({
      where: { semana: sumarDias(semana, -7) },
    });
    if (!anterior.length)
      throw new BadRequestException('La semana anterior no tiene personal');
    const ya = new Set(
      (await this.filas.findBy({ semana })).map((f) => f.trabajadorId),
    );
    const nuevas = anterior
      .filter((f) => !ya.has(f.trabajadorId))
      .map((f) =>
        this.filas.create({
          semana,
          trabajadorId: f.trabajadorId,
          cargo: f.cargo,
          pagoDia: f.pagoDia,
          dias: [false, false, false, false, false, false, false],
        }),
      );
    if (nuevas.length) await this.filas.save(nuevas);
    return this.semana(semana);
  }

  async editar(id: string, dto: EditarFilaDto) {
    const fila = await this.obtener(id);
    const { otrosAbonos, otrosDescuentos, ...datos } = dto;
    if (
      fila.pagadoEn &&
      (dto.dias ||
        dto.pagoDia !== undefined ||
        otrosAbonos !== undefined ||
        otrosDescuentos !== undefined)
    )
      throw new BadRequestException(
        'Esta semana ya se le pagó: deshaz el pago para cambiar los montos',
      );
    await this.filas.manager.transaction(async (em) => {
      Object.assign(fila, datos);
      await em.save(fila);
      const montoRapido = async (
        tipo: TipoMovimiento,
        monto: number | null | undefined,
      ) => {
        if (monto === undefined) return;
        const actuales = await em.findBy(TareoMovimiento, {
          filaId: fila.id,
          tipo,
        });
        if (actuales.length > 1)
          throw new BadRequestException(
            `Esta fila tiene varios ${tipo === TipoMovimiento.ABONO ? 'abonos' : 'descuentos'}: edítalos desde el detalle`,
          );
        if (actuales.length)
          await em.delete(TareoMovimiento, { id: actuales[0].id });
        if (monto && monto > 0)
          await em.save(
            em.create(TareoMovimiento, {
              filaId: fila.id,
              tipo,
              concepto: actuales[0]?.concepto ?? ConceptoMovimiento.OTRO,
              monto,
              nota: actuales[0]?.nota ?? null,
            }),
          );
      };
      await montoRapido(TipoMovimiento.ABONO, otrosAbonos);
      await montoRapido(TipoMovimiento.DESCUENTO, otrosDescuentos);
    });
    return this.semana(fila.semana);
  }

  async pagar(id: string, dto: PagarFilaDto) {
    const fila = await this.obtener(id);
    if (dto.pagadoEn && fila.retenido)
      throw new BadRequestException(
        'Este pago está retenido; quita «retener» antes de marcarlo como pagado',
      );
    fila.pagadoEn = dto.pagadoEn;
    fila.medioPago = dto.pagadoEn ? (dto.medioPago ?? null) : null;
    fila.operacion = dto.pagadoEn ? (dto.operacion ?? null) : null;
    await this.filas.save(fila);
    return this.semana(fila.semana);
  }

  async quitar(id: string) {
    const fila = await this.obtener(id);
    if (fila.pagadoEn)
      throw new BadRequestException(
        'No se puede quitar: esta semana ya se le pagó',
      );
    await this.filas.delete(id);
    return this.semana(fila.semana);
  }

  async agregarMovimiento(filaId: string, dto: CrearMovimientoDto) {
    const fila = await this.obtener(filaId);
    await this.movimientos.save(this.movimientos.create({ ...dto, filaId }));
    return this.semana(fila.semana);
  }

  async quitarMovimiento(id: string) {
    const m = await this.movimientos.findOne({
      where: { id },
      relations: { fila: true },
    });
    if (!m?.fila) throw new NotFoundException('El abono o descuento no existe');
    await this.movimientos.delete(id);
    return this.semana(m.fila.semana);
  }

  /**
   * Resumen del mes por trabajador. Cada día cuenta en el mes en que cae (una semana que cruza
   * de mes se reparte); los abonos y descuentos cuentan en el mes del sábado de su semana.
   */
  async resumenMes(mes: string) {
    const inicio = `${mes}-01`;
    const [a, m] = mes.split('-').map(Number);
    const fin = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
    const filas = await this.filas.find({
      where: { semana: Between(domingoDe(inicio), fin) },
      relations: { trabajador: true, movimientos: true },
    });

    const porTrabajador = new Map<
      string,
      {
        trabajador: {
          id: string;
          nombres: string;
          dni: string | null;
          cargo: string;
        };
        dias: number;
        monto: number;
        abonos: number;
        descuentos: number;
        semanas: number;
        pendientes: number;
      }
    >();
    for (const f of filas) {
      const c = calcularFila(f);
      let dias = 0;
      let monto = 0;
      f.dias.forEach((trabajo, i) => {
        const fecha = sumarDias(f.semana, i);
        if (trabajo && fecha >= inicio && fecha <= fin) {
          dias++;
          monto += f.pagoDia;
        }
      });
      const sabado = sumarDias(f.semana, 6);
      const cuentaMov = sabado >= inicio && sabado <= fin;
      if (!dias && !(cuentaMov && (c.abonos || c.descuentos))) continue;
      const t = f.trabajador!;
      const r = porTrabajador.get(t.id) ?? {
        trabajador: {
          id: t.id,
          nombres: t.nombres,
          dni: t.dni,
          cargo: f.cargo,
        },
        dias: 0,
        monto: 0,
        abonos: 0,
        descuentos: 0,
        semanas: 0,
        pendientes: 0,
      };
      r.dias += dias;
      r.monto += monto;
      if (cuentaMov) {
        r.abonos += c.abonos;
        r.descuentos += c.descuentos;
      }
      r.semanas++;
      if (!f.pagadoEn && c.total > 0) r.pendientes++;
      porTrabajador.set(t.id, r);
    }

    const filasResumen = [...porTrabajador.values()]
      .map((r) => ({
        ...r,
        monto: redondear2(r.monto),
        abonos: redondear2(r.abonos),
        descuentos: redondear2(r.descuentos),
        total: redondear2(r.monto + r.abonos - r.descuentos),
      }))
      .sort((x, y) => x.trabajador.nombres.localeCompare(y.trabajador.nombres));
    const suma = (k: 'dias' | 'monto' | 'abonos' | 'descuentos' | 'total') =>
      redondear2(filasResumen.reduce((s, r) => s + r[k], 0));
    return {
      mes,
      filas: filasResumen,
      totales: {
        trabajadores: filasResumen.length,
        dias: suma('dias'),
        monto: suma('monto'),
        abonos: suma('abonos'),
        descuentos: suma('descuentos'),
        total: suma('total'),
      },
    };
  }

  /**
   * Seguimiento del tareo: por trabajador, los días que trabajó entre dos fechas (con su
   * pago de ese día) y lo que le falta pagar. La pantalla arma con esto el mapa de
   * asistencia, las rachas y los totales.
   */
  async seguimiento(desde: string, hasta: string) {
    const filas = await this.filas.find({
      where: { semana: Between(domingoDe(desde), hasta) },
      relations: { trabajador: true, movimientos: true },
    });
    const porTrabajador = new Map<
      string,
      {
        trabajador: {
          id: string;
          nombres: string;
          dni: string | null;
          cargo: string;
        };
        dias: Record<string, number>;
        porPagar: number;
        semanasPorPagar: number;
        retenido: number;
        ultimaSemana: string;
      }
    >();
    for (const f of filas) {
      const t = f.trabajador!;
      const r = porTrabajador.get(t.id) ?? {
        trabajador: {
          id: t.id,
          nombres: t.nombres,
          dni: t.dni,
          cargo: f.cargo,
        },
        dias: {},
        porPagar: 0,
        semanasPorPagar: 0,
        retenido: 0,
        ultimaSemana: '',
      };
      f.dias.forEach((trabajo, i) => {
        const fecha = sumarDias(f.semana, i);
        if (trabajo && fecha >= desde && fecha <= hasta)
          r.dias[fecha] = f.pagoDia;
      });
      const total = calcularFila(f).total;
      if (!f.pagadoEn && total > 0) {
        if (f.retenido) r.retenido = redondear2(r.retenido + total);
        else {
          r.porPagar = redondear2(r.porPagar + total);
          r.semanasPorPagar++;
        }
      }
      // El cargo que se muestra es el de su semana más reciente.
      if (f.semana >= r.ultimaSemana) {
        r.ultimaSemana = f.semana;
        r.trabajador.cargo = f.cargo;
      }
      porTrabajador.set(t.id, r);
    }
    return {
      desde,
      hasta,
      trabajadores: [...porTrabajador.values()]
        .filter((r) => Object.keys(r.dias).length || r.porPagar || r.retenido)
        .map(({ ultimaSemana: _u, ...r }) => r)
        .sort((a, b) =>
          a.trabajador.nombres.localeCompare(b.trabajador.nombres),
        ),
    };
  }

  // ---------- Voucher del pago de la semana ----------

  /** Enlace firmado para subir el voucher (foto o PDF) directo al almacenamiento. */
  async pedirSubidaVoucher(
    filaId: string,
    dto: {
      nombreArchivo: string;
      tipoContenido: keyof typeof TIPOS_VOUCHER;
      bytes: number;
    },
    usuarioId: string,
  ) {
    const fila = await this.obtener(filaId);
    if (dto.bytes > MAX_BYTES_VOUCHER)
      throw new BadRequestException('El archivo supera 10 MB');
    const ya = await this.vouchers.countBy({
      filaId: fila.id,
      confirmado: true,
    });
    if (ya >= MAX_VOUCHERS)
      throw new ConflictException(
        `Ya hay ${MAX_VOUCHERS} vouchers en esta semana; quita alguno`,
      );
    const id = randomUUID();
    const clave = `tareo/${fila.semana}/${fila.id}/${id}.${TIPOS_VOUCHER[dto.tipoContenido]}`;
    const url = await this.storage.urlParaSubir(clave, dto.tipoContenido);
    await this.vouchers.insert({
      id,
      filaId: fila.id,
      clave,
      nombreArchivo: dto.nombreArchivo,
      tipoContenido: dto.tipoContenido,
      subidoPorId: usuarioId,
    });
    return {
      archivoId: id,
      subida: {
        url,
        metodo: 'PUT',
        headers: { 'Content-Type': dto.tipoContenido },
      },
    };
  }

  async confirmarVoucher(filaId: string, archivoId: string) {
    const v = await this.vouchers.findOneBy({ id: archivoId, filaId });
    if (!v) throw new NotFoundException('El voucher no existe');
    if (!v.confirmado) {
      const guardado = await this.storage.consultar(v.clave);
      if (!guardado)
        throw new ConflictException(
          'El voucher todavía no llegó; vuelve a subirlo',
        );
      if (guardado.bytes > MAX_BYTES_VOUCHER)
        throw new ConflictException('El archivo supera 10 MB');
      await this.vouchers.update(v.id, {
        confirmado: true,
        bytes: guardado.bytes,
      });
    }
    return this.semana((await this.obtener(filaId)).semana);
  }

  async quitarVoucher(filaId: string, archivoId: string) {
    const v = await this.vouchers.findOneBy({ id: archivoId, filaId });
    if (!v) throw new NotFoundException('El voucher no existe');
    await this.vouchers.delete(v.id);
    try {
      await this.storage.borrar(v.clave);
    } catch {
      // Si el archivo no se pudo borrar, igual deja de mostrarse.
    }
    return this.semana((await this.obtener(filaId)).semana);
  }

  private async obtener(id: string) {
    const fila = await this.filas.findOneBy({ id });
    if (!fila) throw new NotFoundException('La fila del tareo no existe');
    return fila;
  }
}
