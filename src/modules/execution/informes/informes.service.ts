import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import type { UsuarioAutenticado } from '../../../core/auth/types/usuario-autenticado.js';
import { escaparLike } from '../../../shared/database/escapar-like.js';
import { redondear2 } from '../../../shared/entities/numerico.transformer.js';
import {
  ETAPAS_EN_ORDEN,
  type EtapaEvidencia,
} from '../../../shared/enums/etapa-evidencia.enum.js';
import { Rol } from '../../../shared/enums/rol.enum.js';
import { StorageService } from '../../../services/storage/storage.service.js';
import { UsuariosService } from '../../core/usuarios/usuarios.service.js';
import { ItemOrden } from '../../planning/ordenes-compra/entities/item-orden.entity.js';
import { EstadoOrden } from '../../planning/ordenes-compra/entities/orden-compra.entity.js';
import { OrdenesCompraService } from '../../planning/ordenes-compra/ordenes-compra.service.js';
import {
  Evidencia,
  TipoEvidencia,
} from '../evidencias/entities/evidencia.entity.js';
import {
  type EvidenciaDto,
  presentarEvidencia,
} from '../evidencias/evidencia.presenter.js';
import { calcularProgreso, type Progreso } from './completitud.js';
import { coordenadasDeEnlace } from './enlace-maps.js';
import type {
  AsignarTecnicosDto,
  CrearInformeDto,
  FiltrosInformeDto,
  ReabrirInformeDto,
  AgregarActividadDto,
  UbicacionDto,
} from './dto/informe.schema.js';
import {
  ESTADOS_EDITABLES,
  EstadoInforme,
  Informe,
} from './entities/informe.entity.js';
import {
  AccionRevision,
  RevisionInforme,
} from './entities/revision-informe.entity.js';

interface TecnicoDto {
  id: string;
  nombre: string;
  usuario: string;
}

/** Una línea de la orden vista como actividad. Los precios solo los ven ADMIN y SUPERVISOR. */
export interface ActividadDto {
  id: string;
  posicion: number;
  codigoMaterial: string | null;
  descripcion: string;
  detalle: string | null;
  cantidad: number;
  unidad: string;
  fechaEntrega: string | null;
  etapas: EtapaEvidencia[];
  /** Fotos por etapa; trae una lista (quizás vacía) por cada etapa exigida. */
  evidencias: Partial<Record<EtapaEvidencia, EvidenciaDto[]>>;
  precioUnitario?: number;
  monto?: number;
}

interface CabeceraInforme {
  id: string;
  estado: EstadoInforme;
  creadoEn: Date;
  actualizadoEn: Date;
  orden: {
    id: string;
    numero: string;
    fechaEmision: string;
    estado: EstadoOrden;
    cliente: { id: string; razonSocial: string };
  };
  sitio: { id: string; codigo: string; nombre: string };
  tecnicos: TecnicoDto[];
}

export interface InformeResumen extends CabeceraInforme {
  cantidadActividades: number;
}

export interface RevisionDto {
  accion: AccionRevision;
  comentario: string | null;
  usuario: { id: string; nombre: string } | null;
  fecha: Date;
}

export interface InformeDetalle extends CabeceraInforme {
  sitio: CabeceraInforme['sitio'] & {
    direccion: string | null;
    latitud: number | null;
    longitud: number | null;
  };
  /** Ubicación tomada en campo. */
  ubicacion: { latitud: number; longitud: number } | null;
  actividades: ActividadDto[];
  /** Fotos de los técnicos con su equipo de protección personal. */
  epp: EvidenciaDto[];
  /** Fotos panorámicas de la torre completa. */
  panoramicas: EvidenciaDto[];
  /** Fotos de las estaciones y equipos. */
  estaciones: EvidenciaDto[];
  /** Fotos descartadas en la revisión; solo las ven ADMIN y SUPERVISOR. */
  descartadas: EvidenciaDto[];
  /** Qué falta para poder finalizar la ejecución. */
  progreso: Progreso;
  /** Cierres y reaperturas de la ejecución, del más antiguo al más reciente. */
  historial: RevisionDto[];
}

@Injectable()
export class InformesService {
  constructor(
    @InjectRepository(Informe)
    private readonly informes: Repository<Informe>,
    @InjectRepository(ItemOrden)
    private readonly items: Repository<ItemOrden>,
    @InjectRepository(Evidencia)
    private readonly evidencias: Repository<Evidencia>,
    @InjectRepository(RevisionInforme)
    private readonly revisiones: Repository<RevisionInforme>,
    private readonly ordenes: OrdenesCompraService,
    private readonly usuarios: UsuariosService,
    private readonly storage: StorageService,
  ) {}

  /** ADMIN y SUPERVISOR ven todos; un TECNICO, solo los que tiene asignados. */
  async listar(
    filtros: FiltrosInformeDto,
    usuario: UsuarioAutenticado,
  ): Promise<InformeResumen[]> {
    const qb = this.informes
      .createQueryBuilder('i')
      .innerJoinAndSelect('i.orden', 'o')
      .innerJoinAndSelect('o.cliente', 'c')
      .innerJoinAndSelect('i.sitio', 's')
      .leftJoinAndSelect('i.tecnicos', 't')
      .orderBy('i.actualizadoEn', 'DESC');

    const tecnicoId =
      usuario.rol === Rol.TECNICO ? usuario.id : filtros.tecnicoId;
    if (tecnicoId) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM informes_tecnicos it WHERE it.informe_id = i.id AND it.usuario_id = :tecnicoId)',
        { tecnicoId },
      );
    }
    if (filtros.estado) {
      qb.andWhere('i.estado = :estado', { estado: filtros.estado });
    }
    if (filtros.ordenId) {
      qb.andWhere('i.ordenId = :ordenId', { ordenId: filtros.ordenId });
    }
    if (filtros.sitioId) {
      qb.andWhere('i.sitioId = :sitioId', { sitioId: filtros.sitioId });
    }
    if (filtros.q) {
      qb.andWhere(
        '(s.codigo ILIKE :q OR s.nombre ILIKE :q OR o.numero ILIKE :q)',
        { q: `%${escaparLike(filtros.q)}%` },
      );
    }

    const informes = await qb.getMany();
    const conteos = await this.contarActividades(informes);
    return informes.map((informe) => ({
      ...cabecera(informe),
      cantidadActividades:
        conteos.get(`${informe.ordenId}:${informe.sitioId}`) ?? 0,
    }));
  }

  async obtener(
    id: string,
    usuario: UsuarioAutenticado,
  ): Promise<InformeDetalle> {
    const informe = await this.buscarParaVer(id, usuario);
    const verDescartadas = usuario.rol !== Rol.TECNICO;
    const [items, evidencias, ocultas, revisiones] = await Promise.all([
      this.actividadesDe(informe),
      this.evidenciasVisibles(informe.id),
      verDescartadas ? this.evidenciasDescartadas(informe.id) : [],
      this.revisiones.find({
        where: { informeId: informe.id },
        relations: { usuario: true },
        order: { creadoEn: 'ASC' },
      }),
    ]);

    const presentar = (lista: Evidencia[]) =>
      Promise.all(
        lista.map(async (e) =>
          presentarEvidencia(
            e,
            this.storage.configurado
              ? await this.storage.urlParaDescargar(e.clave)
              : null,
          ),
        ),
      );
    const [fotos, descartadas] = await Promise.all([
      presentar(evidencias),
      presentar(ocultas),
    ]);
    const conPrecios = usuario.rol !== Rol.TECNICO;
    const sitio = informe.sitio!;

    return {
      ...cabecera(informe),
      sitio: {
        id: sitio.id,
        codigo: sitio.codigo,
        nombre: sitio.nombre,
        direccion: sitio.direccion,
        latitud: sitio.latitud,
        longitud: sitio.longitud,
      },
      ubicacion: ubicacionDe(informe),
      actividades: items.map((item) => actividad(item, fotos, conPrecios)),
      epp: fotos.filter((f) => f.tipo === TipoEvidencia.EPP),
      panoramicas: fotos.filter((f) => f.tipo === TipoEvidencia.PANORAMICA),
      estaciones: fotos.filter((f) => f.tipo === TipoEvidencia.ESTACION),
      descartadas,
      progreso: progresoDe(informe, items, evidencias),
      historial: revisiones.map((r) => ({
        accion: r.accion,
        comentario: r.comentario,
        usuario: r.usuario
          ? { id: r.usuario.id, nombre: r.usuario.nombre }
          : null,
        fecha: r.creadoEn,
      })),
    };
  }

  /** Abre el informe de una orden en un sitio y asigna sus técnicos. */
  async crear(
    dto: CrearInformeDto,
    usuario: UsuarioAutenticado,
  ): Promise<InformeDetalle> {
    const orden = await this.ordenes.obtener(dto.ordenId);
    if (orden.estado !== EstadoOrden.ABIERTA) {
      throw new ConflictException('Solo se abren informes de órdenes ABIERTAS');
    }
    if (!orden.items.some((item) => item.sitioId === dto.sitioId)) {
      throw new ConflictException('La orden no tiene actividades en ese sitio');
    }
    if (
      await this.informes.existsBy({
        ordenId: dto.ordenId,
        sitioId: dto.sitioId,
      })
    ) {
      throw new ConflictException(
        'Ya existe un informe de esa orden para ese sitio',
      );
    }
    const tecnicos = await this.usuarios.exigirTecnicosActivos(dto.tecnicoIds);

    const { id } = await this.informes.save(
      this.informes.create({
        ordenId: dto.ordenId,
        sitioId: dto.sitioId,
        tecnicos,
      }),
    );
    return this.obtener(id, usuario);
  }

  /** Reemplaza la lista de técnicos asignados. */
  async asignarTecnicos(
    id: string,
    dto: AsignarTecnicosDto,
    usuario: UsuarioAutenticado,
  ): Promise<InformeDetalle> {
    const informe = await this.buscarParaVer(id, usuario);
    if (informe.estado === EstadoInforme.FINALIZADO) {
      throw new ConflictException(
        'La ejecución ya está finalizada; reábrela para cambiar los técnicos',
      );
    }
    informe.tecnicos = await this.usuarios.exigirTecnicosActivos(
      dto.tecnicoIds,
    );
    await this.informes.save(informe);
    return this.obtener(id, usuario);
  }

  /**
   * Guarda la ubicación del sitio. Llega como coordenadas (GPS del celular)
   * o como link de Google Maps, del que se sacan las coordenadas.
   */
  async registrarUbicacion(
    id: string,
    dto: UbicacionDto,
    usuario: UsuarioAutenticado,
  ): Promise<InformeDetalle> {
    const informe = await this.buscarParaEditar(id, usuario);
    const { latitud, longitud } =
      'enlace' in dto ? await coordenadasDeEnlace(dto.enlace) : dto;
    await this.informes.update(informe.id, { latitud, longitud });
    return this.obtener(id, usuario);
  }

  /**
   * Da por terminada la ejecución. Solo si está completo: si falta algo,
   * responde 409 con la lista de faltantes en `detalles`.
   */
  async finalizar(
    id: string,
    usuario: UsuarioAutenticado,
  ): Promise<InformeDetalle> {
    const informe = await this.buscarParaEditar(id, usuario);
    const [items, evidencias] = await Promise.all([
      this.actividadesDe(informe),
      this.evidenciasVisibles(informe.id),
    ]);
    const progreso = progresoDe(informe, items, evidencias);
    if (!progreso.completo) {
      throw new ConflictException({
        message: 'El informe está incompleto',
        detalles: progreso.faltantes,
      });
    }
    await this.cambiarEstado(
      informe,
      EstadoInforme.FINALIZADO,
      AccionRevision.FINALIZADO,
      null,
      usuario,
    );
    return this.obtener(id, usuario);
  }

  /** Vuelve a abrir la ejecución para seguir cargando fotos o ítems. */
  async reabrir(
    id: string,
    dto: ReabrirInformeDto,
    usuario: UsuarioAutenticado,
  ): Promise<InformeDetalle> {
    const informe = await this.buscarParaVer(id, usuario);
    if (informe.estado !== EstadoInforme.FINALIZADO) {
      throw new ConflictException('La ejecución ya está abierta');
    }
    await this.cambiarEstado(
      informe,
      EstadoInforme.EN_EJECUCION,
      AccionRevision.REABIERTO,
      dto.comentario ?? null,
      usuario,
    );
    return this.obtener(id, usuario);
  }

  /**
   * Agrega un ítem a la orden, en el sitio de este informe. Aparece de inmediato
   * a los técnicos, que pueden subir sus fotos hasta finalizar la ejecución.
   */
  async agregarActividad(
    id: string,
    dto: AgregarActividadDto,
    usuario: UsuarioAutenticado,
  ): Promise<InformeDetalle> {
    const informe = await this.buscarParaEditar(id, usuario);
    await this.ordenes.agregarItem(informe.ordenId, {
      ...dto,
      sitioId: informe.sitioId,
    });
    return this.obtener(id, usuario);
  }

  /**
   * Busca el informe con sus relaciones. Un técnico no asignado recibe 404,
   * igual que si no existiera: no se revela qué informes hay.
   */
  async buscarParaVer(
    id: string,
    usuario: UsuarioAutenticado,
  ): Promise<Informe> {
    const informe = await this.informes.findOne({
      where: { id },
      relations: { orden: { cliente: true }, sitio: true, tecnicos: true },
    });
    const visible =
      informe &&
      (usuario.rol !== Rol.TECNICO ||
        informe.tecnicos?.some((t) => t.id === usuario.id));
    if (!visible) throw new NotFoundException('El informe no existe');
    return informe;
  }

  /** Solo se edita mientras la ejecución está abierta (EN_EJECUCION). */
  async buscarParaEditar(
    id: string,
    usuario: UsuarioAutenticado,
  ): Promise<Informe> {
    const informe = await this.buscarParaVer(id, usuario);
    if (!ESTADOS_EDITABLES.includes(informe.estado)) {
      throw new ConflictException(
        `El informe está ${informe.estado} y no se puede modificar`,
      );
    }
    return informe;
  }

  /** Ítems de la orden en el sitio del informe, por posición. */
  actividadesDe(informe: Informe): Promise<ItemOrden[]> {
    return this.items.find({
      where: { ordenId: informe.ordenId, sitioId: informe.sitioId },
      order: { posicion: 'ASC' },
    });
  }

  /** Fotos confirmadas y no ocultas, con el técnico y el autor. */
  evidenciasVisibles(informeId: string): Promise<Evidencia[]> {
    return this.evidencias.find({
      where: { informeId, confirmada: true, ocultaEn: IsNull() },
      relations: { tecnico: true, subidoPor: true },
      order: { creadoEn: 'ASC' },
    });
  }

  /** Fotos descartadas en la revisión (ocultas, pero conservadas), con el técnico y el autor. */
  evidenciasDescartadas(informeId: string): Promise<Evidencia[]> {
    return this.evidencias.find({
      where: { informeId, confirmada: true, ocultaEn: Not(IsNull()) },
      relations: { tecnico: true, subidoPor: true },
      order: { creadoEn: 'ASC' },
    });
  }

  /** Cambia el estado y deja constancia en el historial, en una sola transacción. */
  private async cambiarEstado(
    informe: Informe,
    estado: EstadoInforme,
    accion: AccionRevision,
    comentario: string | null,
    usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.informes.manager.transaction(async (em) => {
      await em.update(Informe, informe.id, { estado });
      await em.insert(RevisionInforme, {
        informeId: informe.id,
        accion,
        comentario,
        usuarioId: usuario.id,
      });
    });
  }

  /** Cuántas actividades tiene cada informe (ítems de su orden en su sitio). */
  private async contarActividades(
    informes: Informe[],
  ): Promise<Map<string, number>> {
    if (informes.length === 0) return new Map();
    const filas = await this.items
      .createQueryBuilder('it')
      .select('it.ordenId', 'ordenId')
      .addSelect('it.sitioId', 'sitioId')
      .addSelect('COUNT(*)::int', 'total')
      .where({ ordenId: In([...new Set(informes.map((i) => i.ordenId))]) })
      .groupBy('it.ordenId')
      .addGroupBy('it.sitioId')
      .getRawMany<{ ordenId: string; sitioId: string; total: number }>();
    return new Map(filas.map((f) => [`${f.ordenId}:${f.sitioId}`, f.total]));
  }
}

function cabecera(informe: Informe): CabeceraInforme {
  const orden = informe.orden!;
  const sitio = informe.sitio!;
  return {
    id: informe.id,
    estado: informe.estado,
    creadoEn: informe.creadoEn,
    actualizadoEn: informe.actualizadoEn,
    orden: {
      id: orden.id,
      numero: orden.numero,
      fechaEmision: orden.fechaEmision,
      estado: orden.estado,
      cliente: {
        id: orden.cliente!.id,
        razonSocial: orden.cliente!.razonSocial,
      },
    },
    sitio: { id: sitio.id, codigo: sitio.codigo, nombre: sitio.nombre },
    tecnicos: (informe.tecnicos ?? [])
      .map((t) => ({ id: t.id, nombre: t.nombre, usuario: t.usuario }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };
}

function ubicacionDe(informe: Informe): InformeDetalle['ubicacion'] {
  return informe.latitud !== null && informe.longitud !== null
    ? { latitud: informe.latitud, longitud: informe.longitud }
    : null;
}

function progresoDe(
  informe: Informe,
  items: ItemOrden[],
  evidencias: Evidencia[],
): Progreso {
  return calcularProgreso({
    tecnicos: informe.tecnicos ?? [],
    tieneUbicacion: ubicacionDe(informe) !== null,
    actividades: items,
    evidencias,
  });
}

function actividad(
  item: ItemOrden,
  fotos: EvidenciaDto[],
  conPrecios: boolean,
): ActividadDto {
  const propias = fotos.filter(
    (f) => f.tipo === TipoEvidencia.ACTIVIDAD && f.itemId === item.id,
  );
  // Las etapas exigidas siempre aparecen; si quedó alguna foto de una etapa que
  // ya no se exige (cambiaron las etapas del ítem), también se muestra.
  const etapas = ETAPAS_EN_ORDEN.filter(
    (etapa) =>
      item.etapas.includes(etapa) || propias.some((f) => f.etapa === etapa),
  );
  return {
    id: item.id,
    posicion: item.posicion,
    codigoMaterial: item.codigoMaterial,
    descripcion: item.descripcion,
    detalle: item.detalle,
    cantidad: item.cantidad,
    unidad: item.unidad,
    fechaEntrega: item.fechaEntrega,
    etapas: item.etapas,
    evidencias: Object.fromEntries(
      etapas.map((etapa) => [etapa, propias.filter((f) => f.etapa === etapa)]),
    ),
    ...(conPrecios && {
      precioUnitario: item.precioUnitario,
      monto: redondear2(item.cantidad * item.precioUnitario),
    }),
  };
}
