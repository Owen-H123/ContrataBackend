import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { UsuarioAutenticado } from '../../../core/auth/types/usuario-autenticado.js';
import { escaparLike } from '../../../shared/database/escapar-like.js';
import { Rol } from '../../../shared/enums/rol.enum.js';
import { StorageService } from '../../../services/storage/storage.service.js';
import { TipoNotificacion } from '../../core/notificaciones/entities/notificacion.entity.js';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service.js';
import {
  EstadoOrden,
  OrdenCompra,
} from '../../planning/ordenes-compra/entities/orden-compra.entity.js';
import { EXTENSIONES, MAX_BYTES } from '../evidencias/dto/evidencia.schema.js';
import { coordenadasDeEnlace } from '../informes/enlace-maps.js';
import type {
  ComentarVisitaDto,
  CrearVisitaDto,
  EditarFotoVisitaDto,
  EditarVisitaDto,
  FiltrosVisitaDto,
  ReabrirVisitaDto,
  SubirFotoVisitaDto,
  UbicacionDto,
} from './dto/visita.schema.js';
import {
  ComentarioVisita,
  TipoComentarioVisita,
} from './entities/comentario-visita.entity.js';
import { FotoVisita } from './entities/foto-visita.entity.js';
import {
  EstadoVisita,
  type MotivoVisita,
  VisitaTecnica,
} from './entities/visita-tecnica.entity.js';

/** Fotos que admite una visita. */
export const MAX_FOTOS_VISITA = 40;
const SEGUNDOS_SUBIDA = 15 * 60;

export interface PersonaDto {
  id: string;
  nombre: string;
}

export interface VisitaResumen {
  id: string;
  estado: EstadoVisita;
  fecha: string;
  motivo: MotivoVisita;
  creadoEn: Date;
  actualizadoEn: Date;
  /** Solo número y cliente: nunca montos. */
  orden: {
    id: string;
    numero: string | null;
    cliente: { id: string; razonSocial: string };
  };
  sitio: { id: string; codigo: string; nombre: string };
  tecnico: PersonaDto;
  cantidadFotos: number;
}

export interface FotoVisitaDto {
  id: string;
  nombreArchivo: string;
  comentario: string | null;
  tomadaEn: Date | null;
  subidaEn: Date;
  subidoPor: PersonaDto | null;
  /** Enlace firmado para ver la foto; null si no hay almacenamiento configurado. */
  url: string | null;
}

export interface ComentarioVisitaDto {
  id: string;
  tipo: TipoComentarioVisita;
  texto: string | null;
  autor: PersonaDto | null;
  fecha: Date;
}

export interface VisitaDetalle extends VisitaResumen {
  observaciones: string | null;
  ubicacion: { latitud: number; longitud: number } | null;
  fotos: FotoVisitaDto[];
  comentarios: ComentarioVisitaDto[];
  /** Qué falta para poder finalizarla. */
  faltantes: string[];
}

/** Opciones para registrar una visita: órdenes abiertas con los sitios donde tienen trabajos. */
export interface OpcionOrden {
  id: string;
  numero: string | null;
  cliente: { id: string; razonSocial: string };
  sitios: { id: string; codigo: string; nombre: string }[];
}

export interface SubidaFotoVisita {
  foto: FotoVisitaDto;
  subida: {
    url: string;
    metodo: 'PUT';
    headers: { 'Content-Type': string };
    expiraEnSegundos: number;
  };
}

/**
 * Visitas técnicas. Las registra el técnico (o un ADMIN); un TECNICO solo ve y edita las suyas.
 * ADMIN y SUPERVISOR ven todas. Al finalizar se avisa a ADMIN y SUPERVISOR; el ADMIN puede reabrir.
 */
@Injectable()
export class VisitasService {
  private readonly logger = new Logger(VisitasService.name);

  constructor(
    @InjectRepository(VisitaTecnica)
    private readonly visitas: Repository<VisitaTecnica>,
    @InjectRepository(FotoVisita)
    private readonly fotos: Repository<FotoVisita>,
    @InjectRepository(ComentarioVisita)
    private readonly comentarios: Repository<ComentarioVisita>,
    @InjectRepository(OrdenCompra)
    private readonly ordenes: Repository<OrdenCompra>,
    private readonly storage: StorageService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async listar(
    filtros: FiltrosVisitaDto,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaResumen[]> {
    const qb = this.visitas
      .createQueryBuilder('v')
      .innerJoinAndSelect('v.orden', 'o')
      .innerJoinAndSelect('o.cliente', 'c')
      .innerJoinAndSelect('v.sitio', 's')
      .innerJoinAndSelect('v.tecnico', 't')
      .orderBy('v.fecha', 'DESC')
      .addOrderBy('v.creadoEn', 'DESC');

    if (usuario.rol === Rol.TECNICO) {
      qb.andWhere('v.tecnicoId = :yo', { yo: usuario.id });
    }
    if (filtros.estado) {
      qb.andWhere('v.estado = :estado', { estado: filtros.estado });
    }
    if (filtros.q) {
      qb.andWhere(
        '(s.codigo ILIKE :q OR s.nombre ILIKE :q OR o.numero ILIKE :q)',
        {
          q: `%${escaparLike(filtros.q)}%`,
        },
      );
    }
    const visitas = await qb.getMany();
    const conteos = await this.contarFotos(visitas.map((v) => v.id));
    return visitas.map((v) => resumen(v, conteos.get(v.id) ?? 0));
  }

  /** Órdenes ABIERTAS con sus sitios, para elegir al registrar una visita. Sin montos. */
  async opciones(): Promise<OpcionOrden[]> {
    const ordenes = await this.ordenes.find({
      where: { estado: EstadoOrden.ABIERTA },
      relations: { cliente: true, items: { sitio: true } },
      order: { fechaEmision: 'DESC' },
    });
    return ordenes.map((o) => {
      const sitios = new Map<
        string,
        { id: string; codigo: string; nombre: string }
      >();
      for (const item of o.items ?? []) {
        if (item.sitio && !sitios.has(item.sitio.id)) {
          sitios.set(item.sitio.id, {
            id: item.sitio.id,
            codigo: item.sitio.codigo,
            nombre: item.sitio.nombre,
          });
        }
      }
      return {
        id: o.id,
        numero: o.numero,
        cliente: { id: o.cliente!.id, razonSocial: o.cliente!.razonSocial },
        sitios: [...sitios.values()].sort((a, b) =>
          a.codigo.localeCompare(b.codigo),
        ),
      };
    });
  }

  async obtener(
    id: string,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaDetalle> {
    const visita = await this.buscarParaVer(id, usuario);
    const [fotos, comentarios] = await Promise.all([
      this.fotosVisibles(visita.id),
      this.comentarios.find({
        where: { visitaId: visita.id },
        relations: { autor: true },
        order: { creadoEn: 'ASC' },
      }),
    ]);
    return {
      ...resumen(visita, fotos.length),
      observaciones: visita.observaciones,
      ubicacion:
        visita.latitud !== null && visita.longitud !== null
          ? { latitud: visita.latitud, longitud: visita.longitud }
          : null,
      fotos: await Promise.all(fotos.map((f) => this.presentarFoto(f))),
      comentarios: comentarios.map((c) => ({
        id: c.id,
        tipo: c.tipo,
        texto: c.texto,
        autor: c.autor ? { id: c.autor.id, nombre: c.autor.nombre } : null,
        fecha: c.creadoEn,
      })),
      faltantes: faltantesDe(visita, fotos.length),
    };
  }

  /** La registra el técnico que hizo la visita (queda como responsable). */
  async crear(
    dto: CrearVisitaDto,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaDetalle> {
    const orden = await this.ordenes.findOne({
      where: { id: dto.ordenId },
      relations: { items: true },
    });
    if (!orden) throw new NotFoundException('La orden no existe');
    if (orden.estado !== EstadoOrden.ABIERTA) {
      throw new ConflictException(
        'Solo se registran visitas de órdenes ABIERTAS',
      );
    }
    if (!orden.items?.some((i) => i.sitioId === dto.sitioId)) {
      throw new ConflictException('La orden no tiene trabajos en ese sitio');
    }
    const { id } = await this.visitas.save(
      this.visitas.create({
        ordenId: dto.ordenId,
        sitioId: dto.sitioId,
        tecnicoId: usuario.id,
        fecha: dto.fecha,
        motivo: dto.motivo,
        observaciones: dto.observaciones || null,
      }),
    );
    return this.obtener(id, usuario);
  }

  async editar(
    id: string,
    dto: EditarVisitaDto,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaDetalle> {
    const visita = await this.buscarParaEditar(id, usuario);
    await this.visitas.update(visita.id, {
      ...(dto.fecha !== undefined && { fecha: dto.fecha }),
      ...(dto.motivo !== undefined && { motivo: dto.motivo }),
      ...(dto.observaciones !== undefined && {
        observaciones: dto.observaciones || null,
      }),
    });
    return this.obtener(id, usuario);
  }

  async registrarUbicacion(
    id: string,
    dto: UbicacionDto,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaDetalle> {
    const visita = await this.buscarParaEditar(id, usuario);
    const { latitud, longitud } =
      'enlace' in dto ? await coordenadasDeEnlace(dto.enlace) : dto;
    await this.visitas.update(visita.id, { latitud, longitud });
    return this.obtener(id, usuario);
  }

  // ---------- Fotos ----------

  async solicitarSubida(
    id: string,
    dto: SubirFotoVisitaDto,
    usuario: UsuarioAutenticado,
  ): Promise<SubidaFotoVisita> {
    const visita = await this.buscarParaEditar(id, usuario);
    const cantidad = await this.fotos.countBy({ visitaId: visita.id });
    if (cantidad >= MAX_FOTOS_VISITA) {
      throw new ConflictException(
        `La visita ya tiene ${MAX_FOTOS_VISITA} fotos; quita alguna para subir otra`,
      );
    }
    const fotoId = randomUUID();
    const clave = `visitas/${visita.id}/${fotoId}.${EXTENSIONES[dto.tipoContenido]}`;
    // Primero se firma: si no hay almacenamiento, falla (503) sin dejar registros.
    const url = await this.storage.urlParaSubir(clave, dto.tipoContenido);
    await this.fotos.insert({
      id: fotoId,
      visitaId: visita.id,
      clave,
      nombreArchivo: dto.nombreArchivo,
      tipoContenido: dto.tipoContenido,
      comentario: dto.comentario ?? null,
      tomadaEn: dto.tomadaEn ? new Date(dto.tomadaEn) : null,
      subidoPorId: usuario.id,
    });
    const foto = await this.cargarFoto(visita.id, fotoId);
    return {
      foto: { ...(await this.presentarFoto(foto)), url: null },
      subida: {
        url,
        metodo: 'PUT',
        headers: { 'Content-Type': dto.tipoContenido },
        expiraEnSegundos: SEGUNDOS_SUBIDA,
      },
    };
  }

  /** Verifica que el archivo llegó; desde ahí la foto aparece en la visita. */
  async confirmarFoto(
    id: string,
    fotoId: string,
    usuario: UsuarioAutenticado,
  ): Promise<FotoVisitaDto> {
    const visita = await this.buscarParaEditar(id, usuario);
    const foto = await this.buscarFotoPropia(visita.id, fotoId, usuario);
    if (!foto.confirmada) {
      const archivo = await this.storage.consultar(foto.clave);
      if (!archivo) {
        throw new ConflictException(
          'La foto todavía no llegó al almacenamiento; vuelve a subirla',
        );
      }
      if (archivo.bytes > MAX_BYTES) {
        throw new ConflictException('La foto supera 25 MB');
      }
      await this.fotos.update(foto.id, {
        confirmada: true,
        bytes: archivo.bytes,
      });
    }
    return this.presentarFoto(await this.cargarFoto(visita.id, foto.id));
  }

  async editarFoto(
    id: string,
    fotoId: string,
    dto: EditarFotoVisitaDto,
    usuario: UsuarioAutenticado,
  ): Promise<FotoVisitaDto> {
    const visita = await this.buscarParaEditar(id, usuario);
    const foto = await this.buscarFotoPropia(visita.id, fotoId, usuario);
    await this.fotos.update(foto.id, { comentario: dto.comentario });
    return this.presentarFoto(await this.cargarFoto(visita.id, foto.id));
  }

  /** Quita la foto de la visita (registro y archivo) mientras está en curso. */
  async quitarFoto(
    id: string,
    fotoId: string,
    usuario: UsuarioAutenticado,
  ): Promise<void> {
    const visita = await this.buscarParaEditar(id, usuario);
    const foto = await this.buscarFotoPropia(visita.id, fotoId, usuario);
    await this.fotos.delete(foto.id);
    try {
      await this.storage.borrar(foto.clave);
    } catch (error) {
      this.logger.warn(
        `No se pudo borrar el archivo ${foto.clave}: ${String(error)}`,
      );
    }
  }

  // ---------- Comentarios y estado ----------

  async comentar(
    id: string,
    dto: ComentarVisitaDto,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaDetalle> {
    const visita = await this.buscarParaVer(id, usuario);
    await this.comentarios.insert({
      visitaId: visita.id,
      tipo: TipoComentarioVisita.COMENTARIO,
      texto: dto.texto,
      autorId: usuario.id,
    });
    // Si comenta el técnico, se entera el admin; si comenta otro, se entera el técnico.
    const destinatarios =
      usuario.id === visita.tecnicoId
        ? await this.notificaciones.idsConRol(Rol.ADMIN)
        : [visita.tecnicoId];
    await this.notificaciones.avisar(
      destinatarios,
      {
        tipo: TipoNotificacion.VISITA_COMENTARIO,
        titulo: `${usuario.nombre} comentó la visita ${visita.sitio!.codigo}`,
        detalle: dto.texto,
        visitaId: visita.id,
      },
      usuario.id,
    );
    return this.obtener(id, usuario);
  }

  /** El técnico da por terminada la visita. 409 con `detalles` si falta algo. */
  async finalizar(
    id: string,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaDetalle> {
    const visita = await this.buscarParaEditar(id, usuario);
    const faltantes = faltantesDe(
      visita,
      await this.fotos.countBy({ visitaId: visita.id, confirmada: true }),
    );
    if (faltantes.length > 0) {
      throw new ConflictException({
        message: 'La visita está incompleta',
        detalles: faltantes,
      });
    }
    await this.cambiarEstado(
      visita,
      EstadoVisita.FINALIZADA,
      TipoComentarioVisita.FINALIZADA,
      null,
      usuario,
    );
    await this.notificaciones.avisar(
      await this.notificaciones.idsConRol(Rol.ADMIN, Rol.SUPERVISOR),
      {
        tipo: TipoNotificacion.VISITA_FINALIZADA,
        titulo: `Visita técnica finalizada: ${visita.sitio!.codigo}`,
        detalle: `${visita.sitio!.nombre} · ${visita.orden!.numero ? `OC ${visita.orden!.numero}` : 'Orden pendiente'} · ${usuario.nombre}`,
        visitaId: visita.id,
      },
      usuario.id,
    );
    return this.obtener(id, usuario);
  }

  /** El admin la vuelve a abrir para que el técnico complete o corrija. */
  async reabrir(
    id: string,
    dto: ReabrirVisitaDto,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaDetalle> {
    const visita = await this.buscarParaVer(id, usuario);
    if (visita.estado !== EstadoVisita.FINALIZADA) {
      throw new ConflictException('La visita ya está en curso');
    }
    await this.cambiarEstado(
      visita,
      EstadoVisita.EN_CURSO,
      TipoComentarioVisita.REABIERTA,
      dto.comentario ?? null,
      usuario,
    );
    await this.notificaciones.avisar(
      [visita.tecnicoId],
      {
        tipo: TipoNotificacion.VISITA_REABIERTA,
        titulo: `Reabrieron tu visita: ${visita.sitio!.codigo}`,
        detalle: dto.comentario ?? visita.sitio!.nombre,
        visitaId: visita.id,
      },
      usuario.id,
    );
    return this.obtener(id, usuario);
  }

  /** Borra una visita registrada por error, con sus fotos (solo ADMIN). */
  async eliminar(id: string, usuario: UsuarioAutenticado): Promise<void> {
    const visita = await this.buscarParaVer(id, usuario);
    const fotos = await this.fotos.findBy({ visitaId: visita.id });
    await this.visitas.delete(visita.id);
    for (const foto of fotos) {
      try {
        await this.storage.borrar(foto.clave);
      } catch (error) {
        this.logger.warn(
          `No se pudo borrar el archivo ${foto.clave}: ${String(error)}`,
        );
      }
    }
  }

  // ---------- Ayudantes ----------

  /** Un técnico solo ve las suyas; si no es suya recibe 404, como si no existiera. */
  private async buscarParaVer(
    id: string,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaTecnica> {
    const visita = await this.visitas.findOne({
      where: { id },
      relations: { orden: { cliente: true }, sitio: true, tecnico: true },
    });
    if (
      !visita ||
      (usuario.rol === Rol.TECNICO && visita.tecnicoId !== usuario.id)
    ) {
      throw new NotFoundException('La visita no existe');
    }
    return visita;
  }

  /** Solo se edita en curso, y solo el técnico que la registró o un ADMIN. */
  private async buscarParaEditar(
    id: string,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaTecnica> {
    const visita = await this.buscarParaVer(id, usuario);
    if (usuario.rol !== Rol.ADMIN && visita.tecnicoId !== usuario.id) {
      throw new ForbiddenException(
        'Solo el técnico de la visita o un administrador puede cambiarla',
      );
    }
    if (visita.estado !== EstadoVisita.EN_CURSO) {
      throw new ConflictException(
        'La visita está finalizada y no se puede modificar',
      );
    }
    return visita;
  }

  private async buscarFotoPropia(
    visitaId: string,
    fotoId: string,
    usuario: UsuarioAutenticado,
  ): Promise<FotoVisita> {
    const foto = await this.fotos.findOneBy({ id: fotoId, visitaId });
    if (!foto) throw new NotFoundException('La foto no existe');
    if (usuario.rol !== Rol.ADMIN && foto.subidoPorId !== usuario.id) {
      throw new ForbiddenException(
        'Solo quien subió la foto o un administrador puede cambiarla',
      );
    }
    return foto;
  }

  private fotosVisibles(visitaId: string): Promise<FotoVisita[]> {
    return this.fotos.find({
      where: { visitaId, confirmada: true },
      relations: { subidoPor: true },
      order: { creadoEn: 'ASC' },
    });
  }

  private cargarFoto(visitaId: string, id: string): Promise<FotoVisita> {
    return this.fotos.findOneOrFail({
      where: { id, visitaId },
      relations: { subidoPor: true },
    });
  }

  private async presentarFoto(f: FotoVisita): Promise<FotoVisitaDto> {
    return {
      id: f.id,
      nombreArchivo: f.nombreArchivo,
      comentario: f.comentario,
      tomadaEn: f.tomadaEn,
      subidaEn: f.creadoEn,
      subidoPor: f.subidoPor
        ? { id: f.subidoPor.id, nombre: f.subidoPor.nombre }
        : null,
      url: this.storage.configurado
        ? await this.storage.urlParaDescargar(f.clave)
        : null,
    };
  }

  /** Cambia el estado y deja la constancia en los comentarios, en una sola transacción. */
  private async cambiarEstado(
    visita: VisitaTecnica,
    estado: EstadoVisita,
    tipo: TipoComentarioVisita,
    texto: string | null,
    usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.visitas.manager.transaction(async (em) => {
      await em.update(VisitaTecnica, visita.id, { estado });
      await em.insert(ComentarioVisita, {
        visitaId: visita.id,
        tipo,
        texto,
        autorId: usuario.id,
      });
    });
  }

  private async contarFotos(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const filas = await this.fotos
      .createQueryBuilder('f')
      .select('f.visitaId', 'visitaId')
      .addSelect('COUNT(*)', 'total')
      .where('f.visitaId IN (:...ids)', { ids })
      .andWhere('f.confirmada = true')
      .groupBy('f.visitaId')
      .getRawMany<{ visitaId: string; total: string }>();
    return new Map(filas.map((f) => [f.visitaId, Number(f.total)]));
  }
}

function resumen(v: VisitaTecnica, cantidadFotos: number): VisitaResumen {
  return {
    id: v.id,
    estado: v.estado,
    fecha: v.fecha,
    motivo: v.motivo,
    creadoEn: v.creadoEn,
    actualizadoEn: v.actualizadoEn,
    orden: {
      id: v.orden!.id,
      numero: v.orden!.numero,
      cliente: {
        id: v.orden!.cliente!.id,
        razonSocial: v.orden!.cliente!.razonSocial,
      },
    },
    sitio: {
      id: v.sitio!.id,
      codigo: v.sitio!.codigo,
      nombre: v.sitio!.nombre,
    },
    tecnico: { id: v.tecnico!.id, nombre: v.tecnico!.nombre },
    cantidadFotos,
  };
}

/** Para finalizar: ubicación registrada y al menos una foto. */
function faltantesDe(v: VisitaTecnica, fotos: number): string[] {
  const faltan: string[] = [];
  if (v.latitud === null || v.longitud === null)
    faltan.push('Falta registrar la ubicación');
  if (fotos === 0) faltan.push('Falta al menos una foto de la visita');
  return faltan;
}
