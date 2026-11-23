import {
  BadRequestException,
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
  TareoMovimiento,
  TipoMovimiento,
} from './entities/tareo-movimiento.entity.js';
import { Trabajador } from './entities/trabajador.entity.js';

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
  ) {}

  /** La semana completa: sus 7 fechas, las filas y los totales. */
  async semana(semana: string) {
    const filas = await this.filas.find({
      where: { semana },
      relations: { trabajador: true, movimientos: true },
      order: { trabajador: { nombres: 'ASC' } },
    });
    const calculadas = filas.map(calcularFila);
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
    Object.assign(fila, dto);
    await this.filas.save(fila);
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

  private async obtener(id: string) {
    const fila = await this.filas.findOneBy({ id });
    if (!fila) throw new NotFoundException('La fila del tareo no existe');
    return fila;
  }
}
