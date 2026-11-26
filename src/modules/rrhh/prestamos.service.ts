import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, In, Repository } from 'typeorm';
import { redondear2 } from '../../shared/entities/numerico.transformer.js';
import type {
  ActualizarPrestamoDto,
  CrearPrestamoDto,
  FiltrosPrestamosDto,
} from './dto/rrhh.schema.js';
import { PagoFijoMovimiento } from './entities/pago-fijo-movimiento.entity.js';
import { PagoFijo } from './entities/pago-fijo.entity.js';
import { Prestamo } from './entities/prestamo.entity.js';
import { TareoFila } from './entities/tareo-fila.entity.js';
import {
  ConceptoMovimiento,
  TareoMovimiento,
  TipoMovimiento,
} from './entities/tareo-movimiento.entity.js';
import { Trabajador } from './entities/trabajador.entity.js';

export type EstadoPrestamo = 'ACTIVO' | 'CANCELADO';

/** Domingo de la semana de una fecha (igual que en el tareo). */
function domingo(fecha: string) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

const formatoFecha = (f: string) =>
  `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;

const ultimoDia = (mes: string) =>
  new Date(
    Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0),
  ).getUTCDate();
/** Primer y último día del periodo de un pago fijo (quincena o mes). */
const periodo = (p: Pick<PagoFijo, 'mes' | 'parte'>) => ({
  desde: `${p.mes}-${p.parte === 2 ? '16' : '01'}`,
  hasta: `${p.mes}-${p.parte === 1 ? '15' : String(ultimoDia(p.mes))}`,
});
const NOMBRE_PARTE = ['mes completo', '1.ª quincena', '2.ª quincena'];

export const notaCuota = (p: Pick<Prestamo, 'fecha'>) =>
  `Cuota del préstamo del ${formatoFecha(p.fecha)}`;

/** Préstamo con sus números: lo cobrado (semanas pagadas) y lo que queda. */
export interface PrestamoCalculado {
  id: string;
  trabajador: { id: string; nombres: string; dni: string | null } | null;
  fecha: string;
  monto: number;
  cuota: number;
  nota: string | null;
  /** Descontado en semanas ya pagadas. */
  cobrado: number;
  /** Descontado en semanas que aún no se pagan. */
  programado: number;
  /** Lo que todavía debe (monto − cobrado). */
  saldo: number;
  /** Lo que falta poner en alguna semana (monto − cobrado − programado). */
  porProgramar: number;
  estado: EstadoPrestamo;
}

@Injectable()
export class PrestamosService {
  constructor(
    @InjectRepository(Prestamo)
    private readonly prestamos: Repository<Prestamo>,
    @InjectRepository(TareoMovimiento)
    private readonly movimientos: Repository<TareoMovimiento>,
    @InjectRepository(Trabajador)
    private readonly trabajadores: Repository<Trabajador>,
  ) {}

  /** Suma lo descontado de cada préstamo, separando semanas pagadas y por pagar. */
  private async calcular(
    lista: Prestamo[],
    em: EntityManager = this.prestamos.manager,
  ): Promise<PrestamoCalculado[]> {
    const sumas = new Map<string, { cobrado: number; programado: number }>();
    if (lista.length) {
      const filas: {
        prestamoId: string;
        cobrado: string;
        programado: string;
      }[] = await em
        .getRepository(TareoMovimiento)
        .createQueryBuilder('m')
        .innerJoin('m.fila', 'f')
        .select('m.prestamo_id', 'prestamoId')
        .addSelect(
          'COALESCE(SUM(CASE WHEN f.pagado_en IS NOT NULL THEN m.monto ELSE 0 END), 0)',
          'cobrado',
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN f.pagado_en IS NULL THEN m.monto ELSE 0 END), 0)',
          'programado',
        )
        .where('m.prestamo_id IN (:...ids)', { ids: lista.map((p) => p.id) })
        .groupBy('m.prestamo_id')
        .getRawMany();
      // Lo descontado en los sueldos del personal fijo cuenta igual.
      const fijos: typeof filas = await em
        .getRepository(PagoFijoMovimiento)
        .createQueryBuilder('m')
        .innerJoin('m.pago', 'p')
        .select('m.prestamo_id', 'prestamoId')
        .addSelect(
          'COALESCE(SUM(CASE WHEN p.pagado_en IS NOT NULL THEN m.monto ELSE 0 END), 0)',
          'cobrado',
        )
        .addSelect(
          'COALESCE(SUM(CASE WHEN p.pagado_en IS NULL THEN m.monto ELSE 0 END), 0)',
          'programado',
        )
        .where('m.prestamo_id IN (:...ids)', { ids: lista.map((p) => p.id) })
        .groupBy('m.prestamo_id')
        .getRawMany();
      for (const f of [...filas, ...fijos]) {
        const antes = sumas.get(f.prestamoId) ?? { cobrado: 0, programado: 0 };
        sumas.set(f.prestamoId, {
          cobrado: antes.cobrado + Number(f.cobrado),
          programado: antes.programado + Number(f.programado),
        });
      }
    }
    return lista.map((p) => {
      const { cobrado, programado } = sumas.get(p.id) ?? {
        cobrado: 0,
        programado: 0,
      };
      const saldo = redondear2(Math.max(p.monto - cobrado, 0));
      return {
        id: p.id,
        trabajador: p.trabajador
          ? {
              id: p.trabajador.id,
              nombres: p.trabajador.nombres,
              dni: p.trabajador.dni,
            }
          : null,
        fecha: p.fecha,
        monto: p.monto,
        cuota: p.cuota,
        nota: p.nota,
        cobrado: redondear2(cobrado),
        programado: redondear2(programado),
        saldo,
        porProgramar: redondear2(Math.max(p.monto - cobrado - programado, 0)),
        estado: saldo > 0 ? 'ACTIVO' : 'CANCELADO',
      };
    });
  }

  async listar(filtros: FiltrosPrestamosDto) {
    const lista = await this.prestamos.find({
      where: filtros.trabajadorId ? { trabajadorId: filtros.trabajadorId } : {},
      relations: { trabajador: true },
      order: { fecha: 'DESC', creadoEn: 'DESC' },
    });
    const calculados = await this.calcular(lista);
    const filtrados = filtros.estado
      ? calculados.filter((p) => p.estado === filtros.estado)
      : calculados;
    const activos = calculados.filter((p) => p.estado === 'ACTIVO');
    return {
      prestamos: filtrados,
      totales: {
        activos: activos.length,
        prestado: redondear2(activos.reduce((s, p) => s + p.monto, 0)),
        porCobrar: redondear2(activos.reduce((s, p) => s + p.saldo, 0)),
      },
    };
  }

  /** Un préstamo con cada semana en que se le descontó. */
  async detalle(id: string) {
    const p = await this.prestamos.findOne({
      where: { id },
      relations: { trabajador: true },
    });
    if (!p) throw new NotFoundException('El préstamo no existe');
    const [calculado] = await this.calcular([p]);
    const [cuotas, cuotasFijos] = await Promise.all([
      this.movimientos.find({
        where: { prestamoId: id },
        relations: { fila: true },
      }),
      this.prestamos.manager.find(PagoFijoMovimiento, {
        where: { prestamoId: id },
        relations: { pago: true },
      }),
    ]);
    return {
      ...calculado,
      cuotas: [
        ...cuotas
          .filter((c) => c.fila)
          .map((c) => ({
            filaId: c.filaId,
            semana: c.fila!.semana,
            /** null = semana del tareo; si es sueldo fijo, el nombre del periodo. */
            periodo: null as string | null,
            monto: c.monto,
            pagado: !!c.fila!.pagadoEn,
          })),
        ...cuotasFijos
          .filter((c) => c.pago)
          .map((c) => ({
            filaId: c.pagoId,
            semana: periodo(c.pago!).desde,
            periodo: `Sueldo, ${NOMBRE_PARTE[c.pago!.parte]} de ${c.pago!.mes}`,
            monto: c.monto,
            pagado: !!c.pago!.pagadoEn,
          })),
      ].sort((a, b) => a.semana.localeCompare(b.semana)),
    };
  }

  async crear(dto: CrearPrestamoDto, usuarioId: string) {
    const trabajador = await this.trabajadores.findOneBy({
      id: dto.trabajadorId,
    });
    if (!trabajador) throw new NotFoundException('El trabajador no existe');
    if (dto.cuota > dto.monto)
      throw new BadRequestException(
        'La cuota no puede ser mayor que el préstamo',
      );
    const id = await this.prestamos.manager.transaction(async (em) => {
      const p = await em.save(
        em.create(Prestamo, { ...dto, registradoPorId: usuarioId }),
      );
      // Si ya tiene semanas sin pagar desde la fecha del préstamo, empieza a descontarse ahí.
      const filas = await em
        .getRepository(TareoFila)
        .createQueryBuilder('f')
        .where('f.trabajador_id = :t', { t: dto.trabajadorId })
        .andWhere('f.pagado_en IS NULL')
        .andWhere('f.semana >= :s', { s: domingo(dto.fecha) })
        .getMany();
      await this.aplicarCuotas(em, filas);
      // Y en sus sueldos fijos sin pagar desde el mes del préstamo.
      const pagos = await em
        .getRepository(PagoFijo)
        .createQueryBuilder('p')
        .where('p.trabajador_id = :t', { t: dto.trabajadorId })
        .andWhere('p.pagado_en IS NULL')
        .andWhere('p.mes >= :m', { m: dto.fecha.slice(0, 7) })
        .getMany();
      await this.aplicarCuotasFijos(em, pagos);
      return p.id;
    });
    return this.detalle(id);
  }

  async actualizar(id: string, dto: ActualizarPrestamoDto) {
    const p = await this.prestamos.findOneBy({ id });
    if (!p) throw new NotFoundException('El préstamo no existe');
    const [antes] = await this.calcular([p]);
    const monto = dto.monto ?? p.monto;
    const cuota = dto.cuota ?? p.cuota;
    const yaDescontado = redondear2(antes.cobrado + antes.programado);
    if (monto < yaDescontado)
      throw new BadRequestException(
        `Ya se le descontó S/ ${yaDescontado.toFixed(2)}; el monto no puede ser menor`,
      );
    if (cuota > monto)
      throw new BadRequestException(
        'La cuota no puede ser mayor que el préstamo',
      );
    Object.assign(p, {
      monto,
      cuota,
      fecha: dto.fecha ?? p.fecha,
      nota: dto.nota === undefined ? p.nota : dto.nota,
    });
    await this.prestamos.save(p);
    return this.detalle(id);
  }

  /** Solo si todavía no se le cobró nada en una semana pagada. */
  async eliminar(id: string) {
    const p = await this.prestamos.findOneBy({ id });
    if (!p) throw new NotFoundException('El préstamo no existe');
    const [c] = await this.calcular([p]);
    if (c.cobrado > 0)
      throw new ConflictException(
        'Ya se le descontó en semanas pagadas; no se puede borrar',
      );
    // Las cuotas de semanas sin pagar se borran con él (CASCADE).
    await this.prestamos.delete(id);
    return { ok: true };
  }

  /** Préstamos de esos trabajadores que siguen activos o que tienen cuota en alguna de esas filas. */
  async deTrabajadores(trabajadorIds: string[], filaIds: string[]) {
    if (!trabajadorIds.length) return [];
    const lista = await this.prestamos.find({
      where: { trabajadorId: In(trabajadorIds) },
      order: { fecha: 'ASC', creadoEn: 'ASC' },
    });
    const enFilas = filaIds.length
      ? await this.movimientos.find({
          where: {
            filaId: In(filaIds),
            prestamoId: In(lista.map((p) => p.id)),
          },
          select: { id: true, filaId: true, prestamoId: true, monto: true },
        })
      : [];
    const calculados = await this.calcular(lista);
    return calculados
      .map((p, i) => ({ ...p, trabajadorId: lista[i].trabajadorId }))
      .filter(
        (p) =>
          p.estado === 'ACTIVO' || enFilas.some((m) => m.prestamoId === p.id),
      )
      .map((p) => ({
        ...p,
        cuotasEnFilas: enFilas
          .filter((m) => m.prestamoId === p.id)
          .map((m) => ({
            filaId: m.filaId,
            movimientoId: m.id,
            monto: m.monto,
          })),
      }));
  }

  /**
   * Pone la cuota de cada préstamo activo en las filas sin pagar que no la tengan, de la más
   * antigua a la más nueva, sin pasarse de lo que falta descontar.
   */
  async aplicarCuotas(em: EntityManager, filas: TareoFila[]) {
    const pendientes = filas.filter((f) => !f.pagadoEn);
    if (!pendientes.length) return;
    const lista = await em.find(Prestamo, {
      where: {
        trabajadorId: In([...new Set(pendientes.map((f) => f.trabajadorId))]),
      },
      order: { fecha: 'ASC', creadoEn: 'ASC' },
    });
    if (!lista.length) return;
    const calculados = await this.calcular(lista, em);
    const yaTienen = await em.find(TareoMovimiento, {
      where: {
        filaId: In(pendientes.map((f) => f.id)),
        prestamoId: In(lista.map((p) => p.id)),
      },
      select: { filaId: true, prestamoId: true },
    });
    const falta = new Map(calculados.map((c) => [c.id, c.porProgramar]));
    const nuevos: TareoMovimiento[] = [];
    for (const fila of [...pendientes].sort((a, b) =>
      a.semana.localeCompare(b.semana),
    ))
      for (const p of lista) {
        if (p.trabajadorId !== fila.trabajadorId) continue;
        if (domingo(p.fecha) > fila.semana) continue;
        if (yaTienen.some((m) => m.filaId === fila.id && m.prestamoId === p.id))
          continue;
        const monto = redondear2(Math.min(p.cuota, falta.get(p.id) ?? 0));
        if (monto <= 0) continue;
        falta.set(p.id, redondear2((falta.get(p.id) ?? 0) - monto));
        nuevos.push(
          em.create(TareoMovimiento, {
            filaId: fila.id,
            tipo: TipoMovimiento.DESCUENTO,
            concepto: ConceptoMovimiento.PRESTAMO,
            monto,
            nota: notaCuota(p),
            prestamoId: p.id,
          }),
        );
      }
    if (nuevos.length) await em.save(nuevos);
  }

  /** Préstamos de esos trabajadores activos o con cuota en alguno de esos pagos fijos. */
  async deTrabajadoresFijos(trabajadorIds: string[], pagoIds: string[]) {
    if (!trabajadorIds.length) return [];
    const lista = await this.prestamos.find({
      where: { trabajadorId: In(trabajadorIds) },
      order: { fecha: 'ASC', creadoEn: 'ASC' },
    });
    if (!lista.length) return [];
    const enPagos = pagoIds.length
      ? await this.prestamos.manager.find(PagoFijoMovimiento, {
          where: {
            pagoId: In(pagoIds),
            prestamoId: In(lista.map((p) => p.id)),
          },
          select: { id: true, pagoId: true, prestamoId: true, monto: true },
        })
      : [];
    const calculados = await this.calcular(lista);
    return calculados
      .map((p, i) => ({ ...p, trabajadorId: lista[i].trabajadorId }))
      .filter(
        (p) =>
          p.estado === 'ACTIVO' || enPagos.some((m) => m.prestamoId === p.id),
      )
      .map((p) => ({
        ...p,
        cuotasEnPagos: enPagos
          .filter((m) => m.prestamoId === p.id)
          .map((m) => ({
            pagoId: m.pagoId,
            movimientoId: m.id,
            monto: m.monto,
          })),
      }));
  }

  /** Igual que en el tareo: la cuota en cada sueldo fijo sin pagar, del más antiguo al más nuevo. */
  async aplicarCuotasFijos(em: EntityManager, pagos: PagoFijo[]) {
    const pendientes = pagos.filter((p) => !p.pagadoEn);
    if (!pendientes.length) return;
    const lista = await em.find(Prestamo, {
      where: {
        trabajadorId: In([...new Set(pendientes.map((p) => p.trabajadorId))]),
      },
      order: { fecha: 'ASC', creadoEn: 'ASC' },
    });
    if (!lista.length) return;
    const calculados = await this.calcular(lista, em);
    const yaTienen = await em.find(PagoFijoMovimiento, {
      where: {
        pagoId: In(pendientes.map((p) => p.id)),
        prestamoId: In(lista.map((p) => p.id)),
      },
      select: { pagoId: true, prestamoId: true },
    });
    const falta = new Map(calculados.map((c) => [c.id, c.porProgramar]));
    const nuevos: PagoFijoMovimiento[] = [];
    for (const pago of [...pendientes].sort((a, b) =>
      (a.mes + a.parte).localeCompare(b.mes + b.parte),
    ))
      for (const p of lista) {
        if (p.trabajadorId !== pago.trabajadorId) continue;
        // El préstamo se descuenta desde el periodo en que se dio.
        if (p.fecha > periodo(pago).hasta) continue;
        if (yaTienen.some((m) => m.pagoId === pago.id && m.prestamoId === p.id))
          continue;
        const monto = redondear2(Math.min(p.cuota, falta.get(p.id) ?? 0));
        if (monto <= 0) continue;
        falta.set(p.id, redondear2((falta.get(p.id) ?? 0) - monto));
        nuevos.push(
          em.create(PagoFijoMovimiento, {
            pagoId: pago.id,
            tipo: TipoMovimiento.DESCUENTO,
            concepto: ConceptoMovimiento.PRESTAMO,
            monto,
            fecha: null,
            nota: notaCuota(p),
            prestamoId: p.id,
          }),
        );
      }
    if (nuevos.length) await em.save(nuevos);
  }

  /** Cambia (o quita, con 0) la cuota de un préstamo en un sueldo fijo sin pagar. */
  async fijarCuotaFijo(
    em: EntityManager,
    pago: PagoFijo,
    prestamoId: string,
    monto: number,
  ) {
    if (pago.pagadoEn)
      throw new BadRequestException(
        'Ya se le pagó: deshaz el pago para cambiar la cuota',
      );
    const p = await em.findOneBy(Prestamo, { id: prestamoId });
    if (!p || p.trabajadorId !== pago.trabajadorId)
      throw new NotFoundException('Ese préstamo no es de este trabajador');
    const [c] = await this.calcular([p], em);
    const actual = await em.findOneBy(PagoFijoMovimiento, {
      pagoId: pago.id,
      prestamoId,
    });
    const maximo = redondear2(c.porProgramar + (actual?.monto ?? 0));
    if (monto > maximo)
      throw new BadRequestException(
        `Solo le falta descontar S/ ${maximo.toFixed(2)} de este préstamo`,
      );
    if (actual && monto <= 0) await em.delete(PagoFijoMovimiento, actual.id);
    else if (actual) await em.update(PagoFijoMovimiento, actual.id, { monto });
    else if (monto > 0)
      await em.save(
        em.create(PagoFijoMovimiento, {
          pagoId: pago.id,
          tipo: TipoMovimiento.DESCUENTO,
          concepto: ConceptoMovimiento.PRESTAMO,
          monto,
          fecha: null,
          nota: notaCuota(p),
          prestamoId,
        }),
      );
  }

  /** Cambia (o quita, con 0) la cuota de un préstamo en una semana sin pagar. */
  async fijarCuota(
    em: EntityManager,
    fila: TareoFila,
    prestamoId: string,
    monto: number,
  ) {
    if (fila.pagadoEn)
      throw new BadRequestException(
        'Esta semana ya se le pagó: deshaz el pago para cambiar la cuota',
      );
    const p = await em.findOneBy(Prestamo, { id: prestamoId });
    if (!p || p.trabajadorId !== fila.trabajadorId)
      throw new NotFoundException('Ese préstamo no es de este trabajador');
    const [c] = await this.calcular([p], em);
    const actual = await em.findOneBy(TareoMovimiento, {
      filaId: fila.id,
      prestamoId,
    });
    const maximo = redondear2(c.porProgramar + (actual?.monto ?? 0));
    if (monto > maximo)
      throw new BadRequestException(
        `Solo le falta descontar S/ ${maximo.toFixed(2)} de este préstamo`,
      );
    if (actual && monto <= 0) await em.delete(TareoMovimiento, actual.id);
    else if (actual) await em.update(TareoMovimiento, actual.id, { monto });
    else if (monto > 0)
      await em.save(
        em.create(TareoMovimiento, {
          filaId: fila.id,
          tipo: TipoMovimiento.DESCUENTO,
          concepto: ConceptoMovimiento.PRESTAMO,
          monto,
          nota: notaCuota(p),
          prestamoId,
        }),
      );
  }
}
