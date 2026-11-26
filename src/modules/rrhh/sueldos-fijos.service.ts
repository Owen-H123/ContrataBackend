import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { redondear2 } from '../../shared/entities/numerico.transformer.js';
import type {
  AgregarPagoFijoDto,
  EditarPagoFijoDto,
  MovimientoFijoDto,
  PagarFilaDto,
} from './dto/rrhh.schema.js';
import { StorageService } from '../../services/storage/storage.service.js';
import {
  confirmarSubida,
  conEnlaces,
  pedirSubida,
  quitarAdjunto,
  type SubirAdjuntoDto,
} from '../../shared/archivos/adjuntos.js';
import { PagoFijoMovimiento } from './entities/pago-fijo-movimiento.entity.js';
import { VoucherPagoFijo } from './entities/voucher-pago-fijo.entity.js';
import { PrestamosService } from './prestamos.service.js';
import { PagoFijo } from './entities/pago-fijo.entity.js';
import { TipoMovimiento } from './entities/tareo-movimiento.entity.js';
import {
  PeriodicidadSueldo,
  TipoTrabajador,
  Trabajador,
} from './entities/trabajador.entity.js';

/** Último día del mes AAAA-MM. */
const ultimoDia = (mes: string) =>
  new Date(
    Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0),
  ).getUTCDate();

/** Fechas que cubre el periodo: quincena 1 (1–15), quincena 2 (16–fin) o mes (1–fin). */
export function rangoPeriodo(mes: string, parte: number) {
  const fin = ultimoDia(mes);
  const dia = (d: number) => `${mes}-${String(d).padStart(2, '0')}`;
  if (parte === 1) return { desde: dia(1), hasta: dia(15) };
  if (parte === 2) return { desde: dia(16), hasta: dia(fin) };
  return { desde: dia(1), hasta: dia(fin) };
}

export function calcularPago(p: PagoFijo) {
  const movimientos = [...(p.movimientos ?? [])].sort(
    (a, b) => a.creadoEn.getTime() - b.creadoEn.getTime(),
  );
  const sumar = (tipo: TipoMovimiento) =>
    redondear2(
      movimientos
        .filter((m) => m.tipo === tipo)
        .reduce((s, m) => s + m.monto, 0),
    );
  const abonos = sumar(TipoMovimiento.ABONO);
  const descuentos = sumar(TipoMovimiento.DESCUENTO);
  return {
    id: p.id,
    mes: p.mes,
    parte: p.parte,
    ...rangoPeriodo(p.mes, p.parte),
    trabajador: p.trabajador && {
      id: p.trabajador.id,
      nombres: p.trabajador.nombres,
      dni: p.trabajador.dni,
      cargo: p.trabajador.cargo,
      banco: p.trabajador.banco,
      cuenta: p.trabajador.cuenta,
    },
    sueldo: p.sueldo,
    abonos,
    descuentos,
    total: redondear2(p.sueldo + abonos - descuentos),
    retenido: p.retenido,
    comentario: p.comentario,
    pagadoEn: p.pagadoEn,
    medioPago: p.medioPago,
    operacion: p.operacion,
    movimientos: movimientos.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      concepto: m.concepto,
      monto: m.monto,
      fecha: m.fecha,
      nota: m.nota,
    })),
  };
}

@Injectable()
export class SueldosFijosService {
  constructor(
    @InjectRepository(PagoFijo)
    private readonly pagos: Repository<PagoFijo>,
    @InjectRepository(PagoFijoMovimiento)
    private readonly movimientos: Repository<PagoFijoMovimiento>,
    @InjectRepository(Trabajador)
    private readonly trabajadores: Repository<Trabajador>,
    @InjectRepository(VoucherPagoFijo)
    private readonly vouchers: Repository<VoucherPagoFijo>,
    private readonly storage: StorageService,
    private readonly prestamos: PrestamosService,
  ) {}

  /**
   * Los pagos del mes. Si falta algún trabajador fijo activo (con sueldo), se le crea su
   * pago: dos quincenas o el mes completo, según su ficha.
   */
  async mes(mes: string) {
    await this.prepararMes(mes);
    const pagos = await this.pagos.find({
      where: { mes },
      relations: { trabajador: true, movimientos: true },
      order: { trabajador: { nombres: 'ASC' }, parte: 'ASC' },
    });
    const ids = pagos.map((p) => p.id);
    const [vouchers, prestamos] = await Promise.all([
      ids.length
        ? this.vouchers.find({
            where: { pagoId: In(ids), confirmado: true },
            order: { creadoEn: 'ASC' },
          })
        : [],
      this.prestamos.deTrabajadoresFijos(
        [...new Set(pagos.map((p) => p.trabajadorId))],
        ids,
      ),
    ]);
    const enlaces = await conEnlaces(this.storage, vouchers);
    const lista = pagos.map((p) => ({
      ...calcularPago(p),
      vouchers: enlaces.filter((_, i) => vouchers[i].pagoId === p.id),
      // Préstamos que se le descuentan en este periodo (o que puede descontarse).
      prestamos: prestamos
        .filter((x) => x.trabajadorId === p.trabajadorId)
        .map((x) => ({
          x,
          enEste: x.cuotasEnPagos.find((c) => c.pagoId === p.id),
        }))
        .filter(
          ({ x, enEste }) =>
            enEste || (x.estado === 'ACTIVO' && x.fecha.slice(0, 7) <= p.mes),
        )
        .map(({ x, enEste }) => ({
          id: x.id,
          fecha: x.fecha,
          monto: x.monto,
          cuota: x.cuota,
          saldo: x.saldo,
          porProgramar: x.porProgramar,
          estaSemana: enEste?.monto ?? 0,
          movimientoId: enEste?.movimientoId ?? null,
        })),
    }));
    const suma = (filtro: (p: (typeof lista)[number]) => boolean) =>
      redondear2(lista.filter(filtro).reduce((s, p) => s + p.total, 0));
    return {
      mes,
      pagos: lista,
      totales: {
        trabajadores: new Set(lista.map((p) => p.trabajador?.id)).size,
        sueldos: redondear2(lista.reduce((s, p) => s + p.sueldo, 0)),
        descuentos: redondear2(lista.reduce((s, p) => s + p.descuentos, 0)),
        total: suma(() => true),
        pagado: suma((p) => !!p.pagadoEn),
        porPagar: suma((p) => !p.pagadoEn && !p.retenido),
        retenido: suma((p) => !p.pagadoEn && p.retenido),
      },
    };
  }

  private async prepararMes(mes: string) {
    // No se preparan meses futuros: el sueldo podría cambiar antes.
    const hoy = new Date().toLocaleDateString('en-CA').slice(0, 7);
    if (mes > hoy) return;
    const fijos = await this.trabajadores.findBy({
      tipo: TipoTrabajador.FIJO,
      activo: true,
    });
    const conSueldo = fijos.filter((t) => t.sueldo !== null && t.sueldo > 0);
    if (!conSueldo.length) return;
    const ya = await this.pagos.find({
      where: { mes, trabajadorId: In(conSueldo.map((t) => t.id)) },
      select: { trabajadorId: true, parte: true },
    });
    const nuevos = conSueldo.flatMap((t) =>
      (t.periodicidad === PeriodicidadSueldo.MENSUAL ? [0] : [1, 2])
        // Si ya tiene algún pago en el mes (p. ej. cambió de quincenal a mensual), no se duplica.
        .filter(() => !ya.some((p) => p.trabajadorId === t.id))
        .map((parte) =>
          this.pagos.create({
            trabajadorId: t.id,
            mes,
            parte,
            sueldo: t.sueldo!,
          }),
        ),
    );
    if (!nuevos.length) return;
    const r = await this.pagos
      .createQueryBuilder()
      .insert()
      .values(nuevos)
      .orIgnore()
      .execute();
    // Los préstamos activos se descuentan solos en los pagos recién creados.
    const creados = (r.identifiers as ({ id?: string } | undefined)[])
      .map((i) => i?.id)
      .filter((id): id is string => !!id);
    if (creados.length)
      await this.prestamos.aplicarCuotasFijos(
        this.pagos.manager,
        await this.pagos.findBy({ id: In(creados) }),
      );
  }

  /**
   * Agrega a alguien a los sueldos del mes (aunque en su ficha no esté como fijo). Con
   * «actualizarFicha» queda como fijo con ese sueldo y aparece solo los meses siguientes.
   */
  async agregar(dto: AgregarPagoFijoDto) {
    const hoy = new Date().toLocaleDateString('en-CA').slice(0, 7);
    if (dto.mes > hoy)
      throw new BadRequestException('Ese mes todavía no empieza');
    const t = await this.trabajadores.findOneBy({ id: dto.trabajadorId });
    if (!t) throw new NotFoundException('El trabajador no existe');
    if (!t.activo)
      throw new BadRequestException(
        'Está inactivo en Personal: actívalo primero',
      );
    const ya = await this.pagos.countBy({
      mes: dto.mes,
      trabajadorId: t.id,
    });
    if (ya) throw new ConflictException('Ya está en los sueldos de este mes');
    const partes =
      dto.periodicidad === PeriodicidadSueldo.MENSUAL ? [0] : [1, 2];
    await this.pagos.manager.transaction(async (em) => {
      const creados = await em.save(
        partes.map((parte) =>
          em.create(PagoFijo, {
            trabajadorId: t.id,
            mes: dto.mes,
            parte,
            sueldo: dto.sueldo,
          }),
        ),
      );
      await this.prestamos.aplicarCuotasFijos(em, creados);
      if (dto.actualizarFicha)
        await em.update(Trabajador, t.id, {
          tipo: TipoTrabajador.FIJO,
          sueldo: dto.sueldo,
          periodicidad: dto.periodicidad,
        });
    });
    return this.mes(dto.mes);
  }

  /** Cambia la cuota de un préstamo en este periodo; 0 la quita. */
  async fijarCuotaPrestamo(id: string, prestamoId: string, monto: number) {
    const p = await this.obtener(id);
    await this.pagos.manager.transaction((em) =>
      this.prestamos.fijarCuotaFijo(em, p, prestamoId, monto),
    );
    return this.mes(p.mes);
  }

  // ---------- Voucher del pago ----------

  async pedirSubidaVoucher(
    id: string,
    dto: SubirAdjuntoDto,
    usuarioId: string,
  ) {
    const p = await this.obtener(id);
    return pedirSubida(this.storage, this.vouchers, {
      padre: { pagoId: p.id },
      carpeta: `sueldos/${p.mes}/${p.id}`,
      max: 3,
      dto,
      usuarioId,
    });
  }

  async confirmarVoucher(id: string, archivoId: string) {
    await confirmarSubida(this.storage, this.vouchers, {
      id: archivoId,
      pagoId: id,
    });
    return this.mes((await this.obtener(id)).mes);
  }

  async quitarVoucher(id: string, archivoId: string) {
    await quitarAdjunto(this.storage, this.vouchers, {
      id: archivoId,
      pagoId: id,
    });
    return this.mes((await this.obtener(id)).mes);
  }

  async editar(id: string, dto: EditarPagoFijoDto) {
    const p = await this.obtener(id);
    if (p.pagadoEn && dto.sueldo !== undefined && dto.sueldo !== p.sueldo)
      throw new BadRequestException(
        'Ya se le pagó: deshaz el pago para cambiar el sueldo',
      );
    Object.assign(p, dto);
    await this.pagos.save(p);
    return this.mes(p.mes);
  }

  async pagar(id: string, dto: PagarFilaDto) {
    const p = await this.pagos.findOne({
      where: { id },
      relations: { movimientos: true },
    });
    if (!p) throw new NotFoundException('El pago no existe');
    if (dto.pagadoEn) {
      if (p.retenido)
        throw new BadRequestException(
          'Este pago está retenido; quita «retener» antes de pagarlo',
        );
      if (calcularPago(p).total < 0)
        throw new BadRequestException(
          'Los descuentos superan el sueldo; revisa los adelantos',
        );
    }
    p.pagadoEn = dto.pagadoEn;
    p.medioPago = dto.pagadoEn ? (dto.medioPago ?? null) : null;
    p.operacion = dto.pagadoEn ? (dto.operacion ?? null) : null;
    await this.pagos.save(p);
    return this.mes(p.mes);
  }

  /**
   * Quitar un periodo de alguien que ya no trabaja. Mientras siga activo en Personal, el mes
   * le vuelve a crear su pago, así que primero hay que desactivarlo.
   */
  async quitar(id: string) {
    const p = await this.pagos.findOne({
      where: { id },
      relations: { trabajador: true },
    });
    if (!p) throw new NotFoundException('El pago no existe');
    if (p.pagadoEn)
      throw new BadRequestException('No se puede quitar: ya se le pagó');
    if (p.trabajador?.activo && p.trabajador.tipo === TipoTrabajador.FIJO)
      throw new BadRequestException(
        'Sigue activo como fijo en Personal: desactívalo o cámbialo a jornal primero',
      );
    await this.pagos.delete(id);
    return this.mes(p.mes);
  }

  async agregarMovimiento(pagoId: string, dto: MovimientoFijoDto) {
    const p = await this.obtener(pagoId);
    if (p.pagadoEn)
      throw new BadRequestException(
        'Ya se le pagó: deshaz el pago para agregar adelantos o descuentos',
      );
    await this.movimientos.save(
      this.movimientos.create({ ...dto, fecha: dto.fecha ?? null, pagoId }),
    );
    return this.mes(p.mes);
  }

  async quitarMovimiento(id: string) {
    const m = await this.movimientos.findOne({
      where: { id },
      relations: { pago: true },
    });
    if (!m?.pago) throw new NotFoundException('El movimiento no existe');
    if (m.pago.pagadoEn)
      throw new BadRequestException(
        'Ya se le pagó: deshaz el pago para quitarlo',
      );
    await this.movimientos.delete(id);
    return this.mes(m.pago.mes);
  }

  private async obtener(id: string) {
    const p = await this.pagos.findOneBy({ id });
    if (!p) throw new NotFoundException('El pago no existe');
    return p;
  }
}
