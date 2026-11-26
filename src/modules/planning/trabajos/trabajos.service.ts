import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, type EntityManager, Repository } from 'typeorm';
import type { UsuarioAutenticado } from '../../../core/auth/types/usuario-autenticado.js';
import { redondear2 } from '../../../shared/entities/numerico.transformer.js';
import { Cliente } from '../../master/clientes/entities/cliente.entity.js';
import { Sitio } from '../../master/sitios/entities/sitio.entity.js';
import { OrdenCompra } from '../ordenes-compra/entities/orden-compra.entity.js';
import type {
  ActualizarTrabajoDto,
  ComentarioDto,
  CrearTrabajoDto,
  FiltrosTrabajoDto,
  RevisionDto,
} from './dto/trabajo.schema.js';
import { EventoTrabajo } from './entities/evento-trabajo.entity.js';
import { RevisionPresupuesto } from './entities/revision-presupuesto.entity.js';
import {
  calcularEtapa,
  EtapaTrabajo,
  Trabajo,
} from './entities/trabajo.entity.js';

export const codigoTrabajo = (numero: number) =>
  `TR-${String(numero).padStart(4, '0')}`;

const formatoFecha = (f: string) =>
  `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
const soles = (n: number | null | undefined) =>
  n === null || n === undefined
    ? '—'
    : `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Hitos que se anotan en el historial cuando cambian, con cómo se dicen. */
const HITOS: [keyof Trabajo, string][] = [
  ['enviadoEn', 'Presupuesto enviado'],
  ['revisadoEn', 'Revisado por el cliente'],
  ['aprobadoEn', 'Aprobado'],
  ['ocEn', 'OC recibida'],
  ['ejecucionInicio', 'Inicio de ejecución'],
  ['ejecutadoEn', 'Ejecutado'],
  ['eaSolicitadaEn', 'Acta (EA) solicitada'],
  ['eaAprobadaEn', 'Acta (EA) aprobada'],
  ['facturadoEn', 'Facturado'],
  ['cobradoEn', 'Cobrado'],
];

/** Etapas agrupadas para los indicadores del tablero. */
export const GRUPOS = {
  presupuesto: [
    EtapaTrabajo.SOLICITADO,
    EtapaTrabajo.ENVIADO,
    EtapaTrabajo.REVISADO,
  ],
  porEjecutar: [
    EtapaTrabajo.APROBADO,
    EtapaTrabajo.CON_OC,
    EtapaTrabajo.EN_EJECUCION,
  ],
  porFacturar: [EtapaTrabajo.EJECUTADO, EtapaTrabajo.ACTA],
  porCobrar: [EtapaTrabajo.FACTURADO],
} as const;

function resumen(t: Trabajo) {
  return {
    id: t.id,
    numero: t.numero,
    codigo: codigoTrabajo(t.numero),
    cliente: t.cliente && {
      id: t.cliente.id,
      razonSocial: t.cliente.razonSocial,
    },
    sitio: t.sitio && {
      id: t.sitio.id,
      codigo: t.sitio.codigo,
      nombre: t.sitio.nombre,
    },
    descripcion: t.descripcion,
    area: t.area,
    criticidad: t.criticidad,
    encargado: t.encargado,
    monto: t.monto,
    etapa: t.etapa,
    solicitadoEn: t.solicitadoEn,
    enviadoEn: t.enviadoEn,
    revisadoEn: t.revisadoEn,
    aprobadoEn: t.aprobadoEn,
    aprobadoPor: t.aprobadoPor,
    orden: t.orden ? { id: t.orden.id, numero: t.orden.numero } : null,
    ordenId: t.ordenId,
    ocNumero: t.ocNumero,
    ocEn: t.ocEn,
    ejecucionInicio: t.ejecucionInicio,
    ejecutadoEn: t.ejecutadoEn,
    eaResponsable: t.eaResponsable,
    eaSolicitadaEn: t.eaSolicitadaEn,
    eaAprobadaEn: t.eaAprobadaEn,
    facturaNumero: t.facturaNumero,
    facturadoEn: t.facturadoEn,
    montoFacturado: t.montoFacturado,
    cobradoEn: t.cobradoEn,
    montoCobrado: t.montoCobrado,
    cancelado: t.cancelado,
    canceladoEn: t.canceladoEn,
    comentario: t.comentario,
    observacion: t.observacion,
    importadoDe: t.importadoDe,
    actualizadoEn: t.actualizadoEn,
  };
}

@Injectable()
export class TrabajosService {
  constructor(
    @InjectRepository(Trabajo)
    private readonly trabajos: Repository<Trabajo>,
    @InjectRepository(RevisionPresupuesto)
    private readonly revisiones: Repository<RevisionPresupuesto>,
    @InjectRepository(EventoTrabajo)
    private readonly eventos: Repository<EventoTrabajo>,
  ) {}

  /**
   * Lista con filtros. Los totales salen de todo lo filtrado por año, cliente, área y
   * búsqueda (sin la etapa), para que los indicadores no cambien al cambiar de pestaña.
   */
  async listar(f: FiltrosTrabajoDto) {
    const qb = this.trabajos
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.cliente', 'cliente')
      .leftJoinAndSelect('t.sitio', 'sitio')
      .leftJoinAndSelect('t.orden', 'orden')
      .orderBy('t.solicitado_en', 'DESC')
      .addOrderBy('t.numero', 'DESC');
    if (f.anio)
      qb.andWhere('EXTRACT(YEAR FROM t.solicitado_en) = :anio', {
        anio: f.anio,
      });
    if (f.clienteId) qb.andWhere('t.cliente_id = :c', { c: f.clienteId });
    if (f.area) qb.andWhere('t.area = :a', { a: f.area });
    if (f.revisar) qb.andWhere('t.observacion IS NOT NULL');
    if (f.q)
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('t.descripcion ILIKE :q')
            .orWhere('sitio.codigo ILIKE :q')
            .orWhere('sitio.nombre ILIKE :q')
            .orWhere('t.oc_numero ILIKE :q')
            .orWhere('orden.numero ILIKE :q')
            .orWhere('t.factura_numero ILIKE :q')
            .orWhere('t.encargado ILIKE :q')
            .orWhere("CONCAT('TR-', LPAD(t.numero::text, 4, '0')) ILIKE :q"),
        ),
        { q: `%${f.q}%` },
      );
    const todos = (await qb.getMany()).map(resumen);

    const suma = (
      lista: typeof todos,
      valor: (t: (typeof todos)[number]) => number | null,
    ) => redondear2(lista.reduce((s, t) => s + (valor(t) ?? 0), 0));
    const de = (etapas: readonly EtapaTrabajo[]) =>
      todos.filter((t) => etapas.includes(t.etapa));
    const indicador = (
      etapas: readonly EtapaTrabajo[],
      valor = (t: (typeof todos)[number]) => t.monto,
    ) => {
      const lista = de(etapas);
      return { cantidad: lista.length, monto: suma(lista, valor) };
    };
    const porEtapa = Object.fromEntries(
      Object.values(EtapaTrabajo).map((e) => [e, de([e]).length]),
    ) as Record<EtapaTrabajo, number>;

    return {
      trabajos: f.etapa ? todos.filter((t) => t.etapa === f.etapa) : todos,
      porEtapa,
      paraRevisar: todos.filter((t) => t.observacion).length,
      indicadores: {
        presupuesto: indicador(GRUPOS.presupuesto),
        porEjecutar: indicador(GRUPOS.porEjecutar),
        porFacturar: indicador(GRUPOS.porFacturar),
        porCobrar: indicador(
          GRUPOS.porCobrar,
          (t) => t.montoFacturado ?? t.monto,
        ),
        cobrado: indicador(
          [EtapaTrabajo.COBRADO],
          (t) => t.montoCobrado ?? t.montoFacturado ?? t.monto,
        ),
      },
    };
  }

  async obtener(id: string) {
    const t = await this.trabajos.findOne({
      where: { id },
      relations: { cliente: true, sitio: true, orden: true },
    });
    if (!t) throw new NotFoundException('El trabajo no existe');
    const [revisiones, eventos] = await Promise.all([
      this.revisiones.find({
        where: { trabajoId: id },
        order: { fecha: 'ASC', creadoEn: 'ASC' },
      }),
      this.eventos.find({
        where: { trabajoId: id },
        order: { creadoEn: 'DESC' },
        take: 100,
      }),
    ]);
    return {
      ...resumen(t),
      revisiones: revisiones.map((r, i) => ({
        id: r.id,
        numero: i + 1,
        monto: r.monto,
        fecha: r.fecha,
        nota: r.nota,
      })),
      eventos: eventos.map((e) => ({
        id: e.id,
        tipo: e.tipo,
        texto: e.texto,
        usuario: e.usuarioNombre,
        fecha: e.creadoEn,
      })),
    };
  }

  async crear(dto: CrearTrabajoDto, usuario: UsuarioAutenticado) {
    const id = await this.trabajos.manager.transaction(async (em) => {
      await this.validarReferencias(em, dto);
      const t = em.create(Trabajo, dto);
      t.etapa = calcularEtapa(t);
      const guardado = await em.save(t);
      await this.anotar(
        em,
        guardado.id,
        usuario,
        'CREADO',
        'Trabajo registrado',
      );
      if (t.monto)
        await em.save(
          em.create(RevisionPresupuesto, {
            trabajoId: guardado.id,
            monto: t.monto,
            fecha: t.enviadoEn ?? t.solicitadoEn,
            nota: 'Presupuesto inicial',
          }),
        );
      return guardado.id;
    });
    return this.obtener(id);
  }

  async actualizar(
    id: string,
    dto: ActualizarTrabajoDto,
    usuario: UsuarioAutenticado,
  ) {
    await this.trabajos.manager.transaction(async (em) => {
      const t = await em.findOneBy(Trabajo, { id });
      if (!t) throw new NotFoundException('El trabajo no existe');
      await this.validarReferencias(em, dto);
      const antes = { ...t };
      Object.assign(t, dto);
      // Al cerrar sin terminar sin fecha, se toma la de hoy; al reabrir se limpia.
      if (t.cancelado && !t.canceladoEn)
        t.canceladoEn = new Date().toLocaleDateString('en-CA');
      if (!t.cancelado) t.canceladoEn = null;
      t.etapa = calcularEtapa(t);
      await em.save(t);

      for (const [campo, nombre] of HITOS) {
        const a = antes[campo] as string | null;
        const d = t[campo] as string | null;
        if (a === d) continue;
        await this.anotar(
          em,
          id,
          usuario,
          String(campo),
          d
            ? `${nombre}: ${formatoFecha(d)}${a ? ` (antes ${formatoFecha(a)})` : ''}`
            : `Se quitó «${nombre.toLowerCase()}»`,
        );
      }
      if ((antes.ordenId ?? antes.ocNumero) !== (t.ordenId ?? t.ocNumero))
        await this.anotar(
          em,
          id,
          usuario,
          'OC',
          'Se cambió la orden de compra',
        );
      if (antes.monto !== t.monto)
        await this.anotar(
          em,
          id,
          usuario,
          'MONTO',
          `Monto: ${soles(antes.monto)} → ${soles(t.monto)}`,
        );
      if (antes.cancelado && !t.cancelado)
        await this.anotar(em, id, usuario, 'REABIERTO', 'Reabierto');
      if (antes.etapa !== t.etapa && t.etapa === EtapaTrabajo.CANCELADO)
        await this.anotar(
          em,
          id,
          usuario,
          'CANCELADO',
          `Cerrado: ${String(t.cancelado).toLowerCase().replace('_', ' ')}`,
        );
    });
    return this.obtener(id);
  }

  async eliminar(id: string) {
    const t = await this.trabajos.findOneBy({ id });
    if (!t) throw new NotFoundException('El trabajo no existe');
    await this.trabajos.delete(id);
    return { ok: true };
  }

  /** Nueva versión del presupuesto: pasa a ser el monto vigente. */
  async agregarRevision(
    id: string,
    dto: RevisionDto,
    usuario: UsuarioAutenticado,
  ) {
    await this.trabajos.manager.transaction(async (em) => {
      const t = await em.findOneBy(Trabajo, { id });
      if (!t) throw new NotFoundException('El trabajo no existe');
      await em.save(em.create(RevisionPresupuesto, { ...dto, trabajoId: id }));
      const n = await em.countBy(RevisionPresupuesto, { trabajoId: id });
      t.monto = dto.monto;
      if (!t.enviadoEn) t.enviadoEn = dto.fecha;
      t.etapa = calcularEtapa(t);
      await em.save(t);
      await this.anotar(
        em,
        id,
        usuario,
        'REVISION',
        `${n === 1 ? 'Presupuesto' : `Revisión ${n - 1}`}: ${soles(dto.monto)} (${formatoFecha(dto.fecha)})`,
      );
    });
    return this.obtener(id);
  }

  async quitarRevision(id: string, revisionId: string) {
    await this.trabajos.manager.transaction(async (em) => {
      const r = await em.findOneBy(RevisionPresupuesto, {
        id: revisionId,
        trabajoId: id,
      });
      if (!r) throw new NotFoundException('La revisión no existe');
      await em.delete(RevisionPresupuesto, r.id);
      const ultima = await em.findOne(RevisionPresupuesto, {
        where: { trabajoId: id },
        order: { fecha: 'DESC', creadoEn: 'DESC' },
      });
      await em.update(Trabajo, id, { monto: ultima?.monto ?? null });
    });
    return this.obtener(id);
  }

  async comentar(id: string, dto: ComentarioDto, usuario: UsuarioAutenticado) {
    const t = await this.trabajos.findOneBy({ id });
    if (!t) throw new NotFoundException('El trabajo no existe');
    await this.anotar(
      this.eventos.manager,
      id,
      usuario,
      'COMENTARIO',
      dto.texto,
    );
    return this.obtener(id);
  }

  private async validarReferencias(
    em: EntityManager,
    dto: Pick<ActualizarTrabajoDto, 'clienteId' | 'sitioId' | 'ordenId'>,
  ) {
    if (dto.clienteId && !(await em.existsBy(Cliente, { id: dto.clienteId })))
      throw new NotFoundException('El cliente no existe');
    if (dto.sitioId && !(await em.existsBy(Sitio, { id: dto.sitioId })))
      throw new NotFoundException('El sitio no existe');
    if (dto.ordenId && !(await em.existsBy(OrdenCompra, { id: dto.ordenId })))
      throw new NotFoundException('La orden de compra no existe');
  }

  private anotar(
    em: EntityManager,
    trabajoId: string,
    usuario: UsuarioAutenticado | null,
    tipo: string,
    texto: string,
  ) {
    return em.save(
      em.create(EventoTrabajo, {
        trabajoId,
        tipo,
        texto: texto.slice(0, 500),
        usuarioId: usuario?.id ?? null,
        usuarioNombre: usuario?.nombre ?? null,
      }),
    );
  }
}
