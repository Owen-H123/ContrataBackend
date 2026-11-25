import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, type EntityManager, Repository } from 'typeorm';
import type { UsuarioAutenticado } from '../../../core/auth/types/usuario-autenticado.js';
import { redondear2 } from '../../../shared/entities/numerico.transformer.js';
import { Cliente } from '../../master/clientes/entities/cliente.entity.js';
import { EventoTrabajo } from '../../planning/trabajos/entities/evento-trabajo.entity.js';
import {
  calcularEtapa,
  Trabajo,
} from '../../planning/trabajos/entities/trabajo.entity.js';
import { codigoTrabajo } from '../../planning/trabajos/trabajos.service.js';
import type {
  ActualizarComprobanteDto,
  CrearComprobanteDto,
  FiltrosComprobanteDto,
  PagoDto,
} from './dto/contabilidad.schema.js';
import { Comprobante, TipoComprobante } from './entities/comprobante.entity.js';
import { PagoComprobante } from './entities/pago-comprobante.entity.js';

export type EstadoPago = 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'ANULADO';

const hoy = () => new Date().toLocaleDateString('en-CA');

/** El monto en soles (los comprobantes en dólares usan su tipo de cambio). */
export const enSoles = (
  c: Pick<Comprobante, 'moneda' | 'tipoCambio'>,
  n: number,
) => (c.moneda === 'USD' ? redondear2(n * (c.tipoCambio ?? 1)) : n);

export function calcularComprobante(c: Comprobante) {
  const pagos = [...(c.pagos ?? [])].sort((a, b) =>
    a.fecha === b.fecha
      ? a.creadoEn.getTime() - b.creadoEn.getTime()
      : a.fecha.localeCompare(b.fecha),
  );
  const pagado = redondear2(pagos.reduce((s, p) => s + p.monto, 0));
  const saldo = redondear2(Math.max(c.total - pagado, 0));
  const estado: EstadoPago = c.anulado
    ? 'ANULADO'
    : saldo <= 0.009
      ? 'PAGADO'
      : pagado > 0
        ? 'PARCIAL'
        : 'PENDIENTE';
  return {
    id: c.id,
    tipo: c.tipo,
    clase: c.clase,
    serie: c.serie,
    numero: c.numero,
    codigo: `${c.serie}-${c.numero}`,
    fechaEmision: c.fechaEmision,
    fechaVencimiento: c.fechaVencimiento,
    vencido:
      (estado === 'PENDIENTE' || estado === 'PARCIAL') &&
      !!c.fechaVencimiento &&
      c.fechaVencimiento < hoy(),
    clienteId: c.clienteId,
    contraparteDocumento: c.contraparteDocumento,
    contraparteNombre: c.contraparteNombre,
    moneda: c.moneda,
    tipoCambio: c.tipoCambio,
    baseImponible: c.baseImponible,
    igv: c.igv,
    noGravado: c.noGravado,
    total: c.total,
    totalSoles: enSoles(c, c.total),
    pagado,
    saldo,
    saldoSoles: enSoles(c, saldo),
    estado,
    categoria: c.categoria,
    descripcion: c.descripcion,
    trabajo: c.trabajo
      ? {
          id: c.trabajo.id,
          codigo: codigoTrabajo(c.trabajo.numero),
          sitio: c.trabajo.sitio
            ? { codigo: c.trabajo.sitio.codigo, nombre: c.trabajo.sitio.nombre }
            : null,
          descripcion: c.trabajo.descripcion,
        }
      : null,
    trabajoId: c.trabajoId,
    centroCosto: c.centroCosto,
    anulado: c.anulado,
    nota: c.nota,
    pagos: pagos.map((p) => ({
      id: p.id,
      fecha: p.fecha,
      monto: p.monto,
      medio: p.medio,
      operacion: p.operacion,
      nota: p.nota,
    })),
  };
}

@Injectable()
export class ContabilidadService {
  constructor(
    @InjectRepository(Comprobante)
    private readonly comprobantes: Repository<Comprobante>,
    @InjectRepository(PagoComprobante)
    private readonly pagos: Repository<PagoComprobante>,
  ) {}

  async listar(f: FiltrosComprobanteDto) {
    const qb = this.comprobantes
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.pagos', 'pago')
      .leftJoinAndSelect('c.trabajo', 'trabajo')
      .leftJoinAndSelect('trabajo.sitio', 'sitio')
      .orderBy('c.fecha_emision', 'DESC')
      .addOrderBy('c.creado_en', 'DESC');
    if (f.tipo) qb.andWhere('c.tipo = :tipo', { tipo: f.tipo });
    if (f.mes)
      qb.andWhere("TO_CHAR(c.fecha_emision, 'YYYY-MM') = :mes", { mes: f.mes });
    if (f.anio)
      qb.andWhere('EXTRACT(YEAR FROM c.fecha_emision) = :anio', {
        anio: f.anio,
      });
    if (f.trabajoId) qb.andWhere('c.trabajo_id = :t', { t: f.trabajoId });
    if (f.q)
      qb.andWhere(
        new Brackets((w) =>
          w
            .where("CONCAT(c.serie, '-', c.numero) ILIKE :q")
            .orWhere('c.contraparte_nombre ILIKE :q')
            .orWhere('c.contraparte_documento ILIKE :q')
            .orWhere('c.descripcion ILIKE :q')
            .orWhere('sitio.nombre ILIKE :q')
            .orWhere('sitio.codigo ILIKE :q'),
        ),
        { q: `%${f.q}%` },
      );
    const todos = (await qb.getMany()).map(calcularComprobante);
    const vigentes = todos.filter((c) => c.estado !== 'ANULADO');
    const suma = (lista: typeof todos, k: 'totalSoles' | 'saldoSoles') =>
      redondear2(lista.reduce((s, c) => s + c[k], 0));
    return {
      comprobantes: f.estado
        ? todos.filter((c) => c.estado === f.estado)
        : todos,
      totales: {
        cantidad: vigentes.length,
        total: suma(vigentes, 'totalSoles'),
        pendiente: suma(vigentes, 'saldoSoles'),
        vencido: suma(
          vigentes.filter((c) => c.vencido),
          'saldoSoles',
        ),
        porEstado: {
          PENDIENTE: todos.filter((c) => c.estado === 'PENDIENTE').length,
          PARCIAL: todos.filter((c) => c.estado === 'PARCIAL').length,
          PAGADO: todos.filter((c) => c.estado === 'PAGADO').length,
          ANULADO: todos.filter((c) => c.estado === 'ANULADO').length,
        },
      },
    };
  }

  async obtener(id: string) {
    const c = await this.comprobantes.findOne({
      where: { id },
      relations: { pagos: true, trabajo: { sitio: true } },
    });
    if (!c) throw new NotFoundException('El comprobante no existe');
    return calcularComprobante(c);
  }

  /** Clientes y proveedores ya usados, para autocompletar RUC y nombre. */
  async contrapartes(q: string) {
    const filas: { documento: string; nombre: string; veces: string }[] =
      await this.comprobantes
        .createQueryBuilder('c')
        .select('c.contraparte_documento', 'documento')
        .addSelect('MAX(c.contraparte_nombre)', 'nombre')
        .addSelect('COUNT(*)', 'veces')
        .where(
          new Brackets((w) =>
            w
              .where('c.contraparte_nombre ILIKE :q')
              .orWhere('c.contraparte_documento ILIKE :q'),
          ),
          { q: `%${q}%` },
        )
        .groupBy('c.contraparte_documento')
        .orderBy('veces', 'DESC')
        .limit(8)
        .getRawMany();
    return filas.map((f) => ({ documento: f.documento, nombre: f.nombre }));
  }

  async crear(dto: CrearComprobanteDto, usuario: UsuarioAutenticado) {
    const id = await this.comprobantes.manager.transaction(async (em) => {
      await this.validar(em, dto);
      await this.sinRepetir(em, dto.tipo, dto);
      const c = await em.save(
        em.create(Comprobante, {
          ...dto,
          categoria:
            dto.tipo === TipoComprobante.COMPRA
              ? (dto.categoria ?? null)
              : null,
          tipoCambio: dto.moneda === 'USD' ? (dto.tipoCambio ?? null) : null,
          registradoPorId: usuario.id,
        }),
      );
      await this.sincronizarTrabajo(em, c.trabajoId, usuario);
      return c.id;
    });
    return this.obtener(id);
  }

  async actualizar(
    id: string,
    dto: ActualizarComprobanteDto,
    usuario: UsuarioAutenticado,
  ) {
    await this.comprobantes.manager.transaction(async (em) => {
      const c = await em.findOneBy(Comprobante, { id });
      if (!c) throw new NotFoundException('El comprobante no existe');
      await this.validar(em, dto);
      const trabajoAntes = c.trabajoId;
      Object.assign(c, dto);
      await this.sinRepetir(em, c.tipo, c, c.id);
      if (Math.abs(c.baseImponible + c.igv + c.noGravado - c.total) > 0.05)
        throw new BadRequestException('El total no cuadra con base + IGV');
      await em.save(c);
      await this.sincronizarTrabajo(em, c.trabajoId, usuario);
      if (trabajoAntes && trabajoAntes !== c.trabajoId)
        await this.sincronizarTrabajo(em, trabajoAntes, usuario);
    });
    return this.obtener(id);
  }

  /** Solo si no tiene pagos; si ya tiene, se anula en vez de borrar. */
  async eliminar(id: string, usuario: UsuarioAutenticado) {
    await this.comprobantes.manager.transaction(async (em) => {
      const c = await em.findOneBy(Comprobante, { id });
      if (!c) throw new NotFoundException('El comprobante no existe');
      if (await em.existsBy(PagoComprobante, { comprobanteId: id }))
        throw new ConflictException(
          'Tiene pagos registrados: quítalos o márcalo como anulado',
        );
      await em.delete(Comprobante, id);
      await this.sincronizarTrabajo(em, c.trabajoId, usuario);
    });
    return { ok: true };
  }

  async agregarPago(id: string, dto: PagoDto, usuario: UsuarioAutenticado) {
    await this.comprobantes.manager.transaction(async (em) => {
      const c = await em.findOne(Comprobante, {
        where: { id },
        relations: { pagos: true },
      });
      if (!c) throw new NotFoundException('El comprobante no existe');
      if (c.anulado)
        throw new BadRequestException('Está anulado: no se le registran pagos');
      const { saldo } = calcularComprobante(c);
      if (dto.monto > saldo + 0.05)
        throw new BadRequestException(
          `Solo falta ${c.moneda === 'USD' ? 'US$' : 'S/'} ${saldo.toFixed(2)}`,
        );
      await em.save(
        em.create(PagoComprobante, {
          ...dto,
          comprobanteId: id,
          registradoPorId: usuario.id,
        }),
      );
      await this.sincronizarTrabajo(em, c.trabajoId, usuario);
    });
    return this.obtener(id);
  }

  async quitarPago(pagoId: string, usuario: UsuarioAutenticado) {
    const p = await this.pagos.findOne({
      where: { id: pagoId },
      relations: { comprobante: true },
    });
    if (!p?.comprobante) throw new NotFoundException('El pago no existe');
    await this.comprobantes.manager.transaction(async (em) => {
      await em.delete(PagoComprobante, pagoId);
      await this.sincronizarTrabajo(em, p.comprobante!.trabajoId, usuario);
    });
    return this.obtener(p.comprobanteId);
  }

  private async validar(
    em: EntityManager,
    dto: Pick<ActualizarComprobanteDto, 'clienteId' | 'trabajoId'>,
  ) {
    if (dto.clienteId && !(await em.existsBy(Cliente, { id: dto.clienteId })))
      throw new NotFoundException('El cliente no existe');
    if (dto.trabajoId && !(await em.existsBy(Trabajo, { id: dto.trabajoId })))
      throw new NotFoundException('El trabajo no existe');
  }

  private async sinRepetir(
    em: EntityManager,
    tipo: TipoComprobante,
    d: Pick<Comprobante, 'contraparteDocumento' | 'serie' | 'numero'> &
      Partial<Comprobante>,
    excepto?: string,
  ) {
    const ya = await em.findOneBy(Comprobante, {
      tipo,
      contraparteDocumento: d.contraparteDocumento,
      serie: d.serie,
      numero: d.numero,
    });
    if (ya && ya.id !== excepto)
      throw new ConflictException(
        `Ya está registrado el ${d.serie}-${d.numero} de ese ${tipo === TipoComprobante.VENTA ? 'cliente' : 'proveedor'}`,
      );
  }

  /**
   * Las facturas de venta enlazadas a un trabajo marcan solas su «Factura» y «Cobro» en el
   * seguimiento. Si el trabajo no tiene ventas enlazadas, no se toca (pudo llenarse a mano).
   */
  private async sincronizarTrabajo(
    em: EntityManager,
    trabajoId: string | null,
    usuario: UsuarioAutenticado,
  ) {
    if (!trabajoId) return;
    const t = await em.findOneBy(Trabajo, { id: trabajoId });
    if (!t) return;
    const ventas = (
      await em.find(Comprobante, {
        where: { trabajoId, tipo: TipoComprobante.VENTA, anulado: false },
        relations: { pagos: true },
        order: { fechaEmision: 'ASC' },
      })
    ).map(calcularComprobante);
    if (!ventas.length) return;
    const antes = {
      facturaNumero: t.facturaNumero,
      facturadoEn: t.facturadoEn,
      montoFacturado: t.montoFacturado,
      cobradoEn: t.cobradoEn,
      montoCobrado: t.montoCobrado,
    };
    const base = redondear2(
      ventas.reduce((s, v) => s + enSoles(v, v.baseImponible + v.noGravado), 0),
    );
    const todoCobrado = ventas.every((v) => v.estado === 'PAGADO');
    t.facturaNumero = ventas
      .map((v) => v.codigo)
      .join(', ')
      .slice(0, 20);
    t.facturadoEn = ventas[0].fechaEmision;
    t.montoFacturado = base;
    t.cobradoEn = todoCobrado
      ? ventas
          .flatMap((v) => v.pagos.map((p) => p.fecha))
          .sort()
          .at(-1)!
      : null;
    t.montoCobrado = todoCobrado ? base : null;
    const cambio = (Object.keys(antes) as (keyof typeof antes)[]).some(
      (k) => antes[k] !== t[k],
    );
    if (!cambio) return;
    t.etapa = calcularEtapa(t);
    await em.save(t);
    await em.save(
      em.create(EventoTrabajo, {
        trabajoId: t.id,
        tipo: todoCobrado ? 'cobradoEn' : 'facturadoEn',
        texto: todoCobrado
          ? `Cobrado (desde Contabilidad): ${t.facturaNumero}`
          : `Facturado (desde Contabilidad): ${t.facturaNumero}`,
        usuarioId: usuario.id,
        usuarioNombre: usuario.nombre,
      }),
    );
  }
}
