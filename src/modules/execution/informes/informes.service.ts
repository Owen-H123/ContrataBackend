import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { UsuarioAutenticado } from '../../../core/auth/types/usuario-autenticado.js';
import { escaparLike } from '../../../shared/database/escapar-like.js';
import { redondear2 } from '../../../shared/entities/numerico.transformer.js';
import type { EtapaEvidencia } from '../../../shared/enums/etapa-evidencia.enum.js';
import { Rol } from '../../../shared/enums/rol.enum.js';
import { UsuariosService } from '../../core/usuarios/usuarios.service.js';
import { ItemOrden } from '../../planning/ordenes-compra/entities/item-orden.entity.js';
import { EstadoOrden } from '../../planning/ordenes-compra/entities/orden-compra.entity.js';
import { OrdenesCompraService } from '../../planning/ordenes-compra/ordenes-compra.service.js';
import type {
  AsignarTecnicosDto,
  CrearInformeDto,
  FiltrosInformeDto,
  UbicacionDto,
} from './dto/informe.schema.js';
import {
  ESTADOS_EDITABLES,
  EstadoInforme,
  Informe,
} from './entities/informe.entity.js';

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

export interface InformeDetalle extends CabeceraInforme {
  sitio: CabeceraInforme['sitio'] & {
    direccion: string | null;
    latitud: number | null;
    longitud: number | null;
  };
  /** Ubicación tomada en campo. */
  ubicacion: { latitud: number; longitud: number } | null;
  actividades: ActividadDto[];
}

@Injectable()
export class InformesService {
  constructor(
    @InjectRepository(Informe)
    private readonly informes: Repository<Informe>,
    @InjectRepository(ItemOrden)
    private readonly items: Repository<ItemOrden>,
    private readonly ordenes: OrdenesCompraService,
    private readonly usuarios: UsuariosService,
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
    const informe = await this.buscarVisible(id, usuario);
    const items = await this.items.find({
      where: { ordenId: informe.ordenId, sitioId: informe.sitioId },
      order: { posicion: 'ASC' },
    });
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
      ubicacion:
        informe.latitud !== null && informe.longitud !== null
          ? { latitud: informe.latitud, longitud: informe.longitud }
          : null,
      actividades: items.map((item) => actividad(item, conPrecios)),
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
    const informe = await this.buscarVisible(id, usuario);
    if (informe.estado === EstadoInforme.APROBADO) {
      throw new ConflictException('El informe ya está aprobado');
    }
    informe.tecnicos = await this.usuarios.exigirTecnicosActivos(
      dto.tecnicoIds,
    );
    await this.informes.save(informe);
    return this.obtener(id, usuario);
  }

  /** Guarda la ubicación tomada en campo (latitud y longitud del celular). */
  async registrarUbicacion(
    id: string,
    dto: UbicacionDto,
    usuario: UsuarioAutenticado,
  ): Promise<InformeDetalle> {
    const informe = await this.buscarEditable(id, usuario);
    await this.informes.update(informe.id, {
      latitud: dto.latitud,
      longitud: dto.longitud,
    });
    return this.obtener(id, usuario);
  }

  /**
   * Busca el informe con sus relaciones. Un técnico no asignado recibe 404,
   * igual que si no existiera: no se revela qué informes hay.
   */
  private async buscarVisible(
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

  /** Solo se edita en EN_EJECUCION u OBSERVADO; los supervisores solo consultan. */
  private async buscarEditable(
    id: string,
    usuario: UsuarioAutenticado,
  ): Promise<Informe> {
    const informe = await this.buscarVisible(id, usuario);
    if (!ESTADOS_EDITABLES.includes(informe.estado)) {
      throw new ConflictException(
        `El informe está ${informe.estado} y no se puede modificar`,
      );
    }
    return informe;
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

function actividad(item: ItemOrden, conPrecios: boolean): ActividadDto {
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
    ...(conPrecios && {
      precioUnitario: item.precioUnitario,
      monto: redondear2(item.cantidad * item.precioUnitario),
    }),
  };
}
