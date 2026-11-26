import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ZipArchive } from 'archiver';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import type { UsuarioAutenticado } from '../../../core/auth/types/usuario-autenticado.js';
import { escaparLike } from '../../../shared/database/escapar-like.js';
import { Rol } from '../../../shared/enums/rol.enum.js';
import { StorageService } from '../../../services/storage/storage.service.js';
import { TipoNotificacion } from '../../core/notificaciones/entities/notificacion.entity.js';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service.js';
import { UsuariosService } from '../../core/usuarios/usuarios.service.js';
import { Sitio } from '../../master/sitios/entities/sitio.entity.js';
import { EXTENSIONES, MAX_BYTES } from '../evidencias/dto/evidencia.schema.js';
import { coordenadasDeEnlace } from '../informes/enlace-maps.js';
import type {
  AsignarTecnicoVisitaDto,
  CambiarEstadoVisitaDto,
  ComentarVisitaDto,
  CrearHallazgoDto,
  CrearVisitaDto,
  EditarFotoVisitaDto,
  EditarHallazgoDto,
  EditarVisitaDto,
  FiltrosVisitaDto,
  SubirFotoVisitaDto,
  UbicacionDto,
} from './dto/visita.schema.js';
import { ComentarioVisita } from './entities/comentario-visita.entity.js';
import {
  FotoVisita,
  SeccionFotoVisita,
} from './entities/foto-visita.entity.js';
import {
  HallazgoVisita,
  UnidadMedida,
} from './entities/hallazgo-visita.entity.js';
import {
  EstadoVisita,
  VisitaTecnica,
} from './entities/visita-tecnica.entity.js';

/** Fotos que admite cada sección fija y cada hallazgo. */
export const MAX_FOTOS_GRUPO = 20;
/** Hallazgos que admite una visita. */
export const MAX_HALLAZGOS = 50;
const SEGUNDOS_SUBIDA = 15 * 60;

const NOMBRE_ESTADO: Record<EstadoVisita, string> = {
  PENDIENTE: 'pendiente de visitar',
  VISITADO: 'visitado',
  ACCESO_RECHAZADO: 'acceso rechazado',
};

interface PersonaDto {
  id: string;
  nombre: string;
}

export interface VisitaResumen {
  id: string;
  estado: EstadoVisita;
  fecha: string;
  creadoEn: Date;
  actualizadoEn: Date;
  sitio: { id: string; codigo: string; nombre: string };
  tecnico: PersonaDto;
  cantidadHallazgos: number;
  cantidadFotos: number;
}

export interface FotoVisitaDto {
  id: string;
  seccion: SeccionFotoVisita;
  hallazgoId: string | null;
  nombreArchivo: string;
  comentario: string | null;
  tomadaEn: Date | null;
  subidaEn: Date;
  subidoPor: PersonaDto | null;
  /** Enlace firmado para ver la foto; null si no hay almacenamiento configurado. */
  url: string | null;
}

export interface HallazgoDto {
  id: string;
  posicion: number;
  descripcion: string;
  correctivo: string | null;
  /** Si lleva medidas y en qué unidad. */
  conMedidas: boolean;
  unidad: UnidadMedida;
  /** Medidas en la unidad del ítem. */
  largo: number | null;
  ancho: number | null;
  alto: number | null;
  comentario: string | null;
  fotos: FotoVisitaDto[];
  /** Fotos con el flexómetro mostrando la medida. */
  fotosMedida: FotoVisitaDto[];
}

export interface ComentarioVisitaDto {
  id: string;
  texto: string | null;
  /** Solo en las constancias de cambio de estado. */
  estado: EstadoVisita | null;
  autor: PersonaDto | null;
  fecha: Date;
}

export interface VisitaDetalle extends VisitaResumen {
  observaciones: string | null;
  sitio: VisitaResumen['sitio'] & { direccion: string | null };
  ubicacion: { latitud: number; longitud: number } | null;
  epp: FotoVisitaDto[];
  fachada: FotoVisitaDto[];
  croquis: FotoVisitaDto[];
  hallazgos: HallazgoDto[];
  comentarios: ComentarioVisitaDto[];
  /** Qué falta para dar la visita por completa (solo informa, no bloquea). */
  faltantes: string[];
}

/** Lo que necesita el formulario de nueva visita: los sitios existentes. */
export interface OpcionesVisita {
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
 * Visitas técnicas. Las registra el técnico (o un ADMIN) y quedan a su nombre; un TECNICO solo
 * ve y edita las suyas. ADMIN y SUPERVISOR ven todas; SUPERVISOR solo consulta.
 */
@Injectable()
export class VisitasService {
  private readonly logger = new Logger(VisitasService.name);

  constructor(
    @InjectRepository(VisitaTecnica)
    private readonly visitas: Repository<VisitaTecnica>,
    @InjectRepository(HallazgoVisita)
    private readonly hallazgos: Repository<HallazgoVisita>,
    @InjectRepository(FotoVisita)
    private readonly fotos: Repository<FotoVisita>,
    @InjectRepository(ComentarioVisita)
    private readonly comentarios: Repository<ComentarioVisita>,
    @InjectRepository(Sitio)
    private readonly sitios: Repository<Sitio>,
    private readonly storage: StorageService,
    private readonly notificaciones: NotificacionesService,
    private readonly usuarios: UsuariosService,
  ) {}

  async listar(
    filtros: FiltrosVisitaDto,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaResumen[]> {
    const qb = this.visitas
      .createQueryBuilder('v')
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
      qb.andWhere('(s.codigo ILIKE :q OR s.nombre ILIKE :q)', {
        q: `%${escaparLike(filtros.q)}%`,
      });
    }
    const visitas = await qb.getMany();
    const ids = visitas.map((v) => v.id);
    const [fotos, hallazgos] = await Promise.all([
      this.contar(this.fotos, ids, 'f.confirmada = true'),
      this.contar(this.hallazgos, ids),
    ]);
    return visitas.map((v) =>
      resumen(v, hallazgos.get(v.id) ?? 0, fotos.get(v.id) ?? 0),
    );
  }

  async opciones(): Promise<OpcionesVisita> {
    const sitios = await this.sitios.find({
      where: { activo: true },
      order: { codigo: 'ASC' },
    });
    return {
      sitios: sitios.map((s) => ({
        id: s.id,
        codigo: s.codigo,
        nombre: s.nombre,
      })),
    };
  }

  async obtener(
    id: string,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaDetalle> {
    const visita = await this.buscarParaVer(id, usuario);
    const [hallazgos, fotos, comentarios] = await Promise.all([
      this.hallazgos.find({
        where: { visitaId: visita.id },
        order: { posicion: 'ASC' },
      }),
      this.fotos.find({
        where: { visitaId: visita.id, confirmada: true },
        relations: { subidoPor: true },
        order: { creadoEn: 'ASC' },
      }),
      this.comentarios.find({
        where: { visitaId: visita.id },
        relations: { autor: true },
        order: { creadoEn: 'ASC' },
      }),
    ]);
    const presentadas = await Promise.all(
      fotos.map((f) => this.presentarFoto(f)),
    );
    const de = (seccion: SeccionFotoVisita) =>
      presentadas.filter((f) => f.seccion === seccion);
    const detalle: VisitaDetalle = {
      ...resumen(visita, hallazgos.length, fotos.length),
      sitio: {
        ...resumen(visita, 0, 0).sitio,
        direccion: visita.sitio!.direccion ?? null,
      },
      observaciones: visita.observaciones,
      ubicacion:
        visita.latitud !== null && visita.longitud !== null
          ? { latitud: visita.latitud, longitud: visita.longitud }
          : null,
      epp: de(SeccionFotoVisita.EPP),
      fachada: de(SeccionFotoVisita.FACHADA),
      croquis: de(SeccionFotoVisita.CROQUIS),
      hallazgos: hallazgos.map((h) => ({
        id: h.id,
        posicion: h.posicion,
        descripcion: h.descripcion,
        correctivo: h.correctivo,
        conMedidas: h.conMedidas,
        unidad: h.unidad,
        largo: h.largo,
        ancho: h.ancho,
        alto: h.alto,
        comentario: h.comentario,
        fotos: presentadas.filter(
          (f) =>
            f.hallazgoId === h.id && f.seccion === SeccionFotoVisita.HALLAZGO,
        ),
        fotosMedida: presentadas.filter(
          (f) =>
            f.hallazgoId === h.id && f.seccion === SeccionFotoVisita.MEDIDA,
        ),
      })),
      comentarios: comentarios.map((c) => ({
        id: c.id,
        texto: c.texto,
        estado: c.estado,
        autor: c.autor ? { id: c.autor.id, nombre: c.autor.nombre } : null,
        fecha: c.creadoEn,
      })),
      faltantes: [],
    };
    detalle.faltantes = faltantesDe(detalle);
    return detalle;
  }

  /** La registra el técnico que hace la visita, con un sitio existente o uno nuevo. */
  async crear(
    dto: CrearVisitaDto,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaDetalle> {
    const sitioId = dto.sitioId
      ? await this.exigirSitio(dto.sitioId)
      : await this.crearSitio(dto.sitioNuevo!);
    // Un ADMIN o SUPERVISOR puede dejarla a cargo de un técnico; si no, queda a nombre de quien la registra.
    const tecnicoId =
      (usuario.rol === Rol.ADMIN || usuario.rol === Rol.SUPERVISOR) &&
      dto.tecnicoId
        ? (await this.usuarios.exigirTecnicosActivos([dto.tecnicoId]))[0].id
        : usuario.id;
    const { id } = await this.visitas.save(
      this.visitas.create({
        sitioId,
        tecnicoId,
        fecha: dto.fecha,
        observaciones: dto.observaciones || null,
      }),
    );
    const detalle = await this.obtener(id, usuario);
    if (tecnicoId !== usuario.id) {
      await this.avisarAsignacion(detalle, tecnicoId, usuario);
    }
    return detalle;
  }

  /** ADMIN: pasa la visita a otro técnico, que desde ahora la ve y la edita. */
  async asignarTecnico(
    id: string,
    dto: AsignarTecnicoVisitaDto,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaDetalle> {
    const visita = await this.buscarParaVer(id, usuario);
    if (visita.tecnicoId === dto.tecnicoId) return this.obtener(id, usuario);
    const [tecnico] = await this.usuarios.exigirTecnicosActivos([
      dto.tecnicoId,
    ]);
    await this.visitas.update(visita.id, { tecnicoId: tecnico.id });
    const detalle = await this.obtener(id, usuario);
    await this.avisarAsignacion(detalle, tecnico.id, usuario);
    return detalle;
  }

  /** Avisa al técnico que le asignaron la visita (sin tipo nuevo: usa el aviso de visitas). */
  private avisarAsignacion(
    visita: VisitaDetalle,
    tecnicoId: string,
    usuario: UsuarioAutenticado,
  ): Promise<void> {
    return this.notificaciones.avisar(
      [tecnicoId],
      {
        tipo: TipoNotificacion.VISITA_ESTADO,
        titulo: `Te asignaron una visita técnica: ${visita.sitio.codigo}`,
        detalle: `${visita.sitio.nombre} · ${visita.fecha}`,
        visitaId: visita.id,
      },
      usuario.id,
    );
  }

  async editar(
    id: string,
    dto: EditarVisitaDto,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaDetalle> {
    const visita = await this.buscarParaEditar(id, usuario);
    await this.visitas.update(visita.id, {
      ...(dto.fecha !== undefined && { fecha: dto.fecha }),
      ...(dto.observaciones !== undefined && {
        observaciones: dto.observaciones || null,
      }),
    });
    return this.obtener(id, usuario);
  }

  /**
   * Cambia el estado (pendiente, visitado, acceso rechazado) y deja la constancia. Si lo cambia
   * el técnico se avisa a ADMIN y SUPERVISOR; si lo cambia otro, se avisa al técnico.
   */
  async cambiarEstado(
    id: string,
    dto: CambiarEstadoVisitaDto,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaDetalle> {
    const visita = await this.buscarParaEditar(id, usuario);
    if (visita.estado === dto.estado) return this.obtener(id, usuario);
    await this.visitas.manager.transaction(async (em) => {
      await em.update(VisitaTecnica, visita.id, { estado: dto.estado });
      await em.insert(ComentarioVisita, {
        visitaId: visita.id,
        estado: dto.estado,
        texto: dto.comentario ?? null,
        autorId: usuario.id,
      });
    });
    const destinatarios =
      usuario.id === visita.tecnicoId
        ? await this.notificaciones.idsConRol(Rol.ADMIN, Rol.SUPERVISOR)
        : [visita.tecnicoId];
    await this.notificaciones.avisar(
      destinatarios,
      {
        tipo: TipoNotificacion.VISITA_ESTADO,
        titulo: `Visita ${visita.sitio!.codigo}: ${NOMBRE_ESTADO[dto.estado]}`,
        detalle:
          dto.comentario ?? `${visita.sitio!.nombre} · ${usuario.nombre}`,
        visitaId: visita.id,
      },
      usuario.id,
    );
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

  // ---------- Hallazgos ----------

  async crearHallazgo(
    id: string,
    dto: CrearHallazgoDto,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaDetalle> {
    const visita = await this.buscarParaEditar(id, usuario);
    const existentes = await this.hallazgos.find({
      where: { visitaId: visita.id },
      select: { posicion: true },
    });
    if (existentes.length >= MAX_HALLAZGOS) {
      throw new ConflictException(
        `La visita admite hasta ${MAX_HALLAZGOS} hallazgos`,
      );
    }
    const posicion = Math.max(0, ...existentes.map((h) => h.posicion)) + 1;
    await this.hallazgos.insert({
      visitaId: visita.id,
      posicion,
      descripcion: dto.descripcion,
      correctivo: dto.correctivo || null,
      conMedidas: dto.conMedidas ?? false,
      unidad: dto.unidad ?? UnidadMedida.M,
      largo: dto.largo ?? null,
      ancho: dto.ancho ?? null,
      alto: dto.alto ?? null,
      comentario: dto.comentario || null,
    });
    return this.obtener(id, usuario);
  }

  async editarHallazgo(
    id: string,
    hallazgoId: string,
    dto: EditarHallazgoDto,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaDetalle> {
    const visita = await this.buscarParaEditar(id, usuario);
    const hallazgo = await this.exigirHallazgo(visita.id, hallazgoId);
    await this.hallazgos.update(hallazgo.id, {
      ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
      ...(dto.correctivo !== undefined && {
        correctivo: dto.correctivo || null,
      }),
      ...(dto.conMedidas !== undefined && { conMedidas: dto.conMedidas }),
      ...(dto.unidad !== undefined && { unidad: dto.unidad }),
      ...(dto.largo !== undefined && { largo: dto.largo }),
      ...(dto.ancho !== undefined && { ancho: dto.ancho }),
      ...(dto.alto !== undefined && { alto: dto.alto }),
      ...(dto.comentario !== undefined && {
        comentario: dto.comentario || null,
      }),
    });
    return this.obtener(id, usuario);
  }

  /** Quita el hallazgo con sus fotos (registros y archivos). */
  async eliminarHallazgo(
    id: string,
    hallazgoId: string,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaDetalle> {
    const visita = await this.buscarParaEditar(id, usuario);
    const hallazgo = await this.exigirHallazgo(visita.id, hallazgoId);
    const fotos = await this.fotos.findBy({ hallazgoId: hallazgo.id });
    await this.hallazgos.delete(hallazgo.id);
    await this.borrarArchivos(fotos);
    return this.obtener(id, usuario);
  }

  // ---------- Fotos ----------

  async solicitarSubida(
    id: string,
    dto: SubirFotoVisitaDto,
    usuario: UsuarioAutenticado,
  ): Promise<SubidaFotoVisita> {
    const visita = await this.buscarParaEditar(id, usuario);
    const hallazgoId = dto.hallazgoId
      ? (await this.exigirHallazgo(visita.id, dto.hallazgoId)).id
      : null;
    const enGrupo = await this.fotos.countBy({
      visitaId: visita.id,
      seccion: dto.seccion,
      ...(hallazgoId && { hallazgoId }),
    });
    if (enGrupo >= MAX_FOTOS_GRUPO) {
      throw new ConflictException(
        `Ya hay ${MAX_FOTOS_GRUPO} fotos aquí; quita alguna para subir otra`,
      );
    }
    const fotoId = randomUUID();
    const clave = `visitas/${visita.id}/${fotoId}.${EXTENSIONES[dto.tipoContenido]}`;
    // Primero se firma: si no hay almacenamiento, falla (503) sin dejar registros.
    const url = await this.storage.urlParaSubir(clave, dto.tipoContenido);
    await this.fotos.insert({
      id: fotoId,
      visitaId: visita.id,
      seccion: dto.seccion,
      hallazgoId,
      clave,
      nombreArchivo: dto.nombreArchivo,
      tipoContenido: dto.tipoContenido,
      comentario: dto.comentario ?? null,
      tomadaEn: dto.tomadaEn ? new Date(dto.tomadaEn) : null,
      subidoPorId: usuario.id,
    });
    const foto = await this.cargarFoto(visita.id, fotoId);
    return {
      foto: { ...presentarSinUrl(foto) },
      subida: {
        url,
        metodo: 'PUT',
        headers: { 'Content-Type': dto.tipoContenido },
        expiraEnSegundos: SEGUNDOS_SUBIDA,
      },
    };
  }

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

  async quitarFoto(
    id: string,
    fotoId: string,
    usuario: UsuarioAutenticado,
  ): Promise<void> {
    const visita = await this.buscarParaEditar(id, usuario);
    const foto = await this.buscarFotoPropia(visita.id, fotoId, usuario);
    await this.fotos.delete(foto.id);
    await this.borrarArchivos([foto]);
  }

  // ---------- Comentarios ----------

  async comentar(
    id: string,
    dto: ComentarVisitaDto,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaDetalle> {
    const visita = await this.buscarParaVer(id, usuario);
    await this.comentarios.insert({
      visitaId: visita.id,
      texto: dto.texto,
      autorId: usuario.id,
    });
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

  /** Borra una visita registrada por error, con sus fotos (solo ADMIN). */
  async eliminar(id: string, usuario: UsuarioAutenticado): Promise<void> {
    const visita = await this.buscarParaVer(id, usuario);
    const fotos = await this.fotos.findBy({ visitaId: visita.id });
    await this.visitas.delete(visita.id);
    await this.borrarArchivos(fotos);
  }

  /**
   * ZIP con las fotos en carpetas: `1 EPP`, `2 Fachada`, `3 Croquis` y
   * `4 Ítems/01 Techo en mal estado/…` (con `Medidas/` para las fotos con flexómetro).
   * Se transmite mientras se arma.
   */
  async descargarZip(
    id: string,
    usuario: UsuarioAutenticado,
    res: Response,
  ): Promise<void> {
    const visita = await this.buscarParaVer(id, usuario);
    const [fotos, hallazgos] = await Promise.all([
      this.fotos.find({
        where: { visitaId: visita.id, confirmada: true },
        order: { creadoEn: 'ASC' },
      }),
      this.hallazgos.find({ where: { visitaId: visita.id } }),
    ]);
    if (fotos.length === 0) {
      throw new NotFoundException('La visita todavía no tiene fotos');
    }
    if (!this.storage.configurado) {
      throw new ServiceUnavailableException(
        'El almacenamiento de fotos no está configurado',
      );
    }
    const nombre = limpiar(`Visita ${visita.sitio!.codigo} ${visita.fecha}`);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${nombre}.zip"; filename*=UTF-8''${encodeURIComponent(nombre)}.zip`,
    );
    const zip = new ZipArchive({ store: true });
    zip.pipe(res);
    try {
      const contadores = new Map<string, number>();
      const ordenadas = [...fotos].sort(
        (a, b) =>
          ORDEN_SECCION[a.seccion] - ORDEN_SECCION[b.seccion] ||
          (hallazgos.find((h) => h.id === a.hallazgoId)?.posicion ?? 0) -
            (hallazgos.find((h) => h.id === b.hallazgoId)?.posicion ?? 0) ||
          (a.tomadaEn ?? a.creadoEn).getTime() -
            (b.tomadaEn ?? b.creadoEn).getTime(),
      );
      for (const foto of ordenadas) {
        const carpeta = carpetaDe(foto, hallazgos);
        const n = (contadores.get(carpeta) ?? 0) + 1;
        contadores.set(carpeta, n);
        const extension = foto.clave.split('.').pop();
        zip.append(await this.storage.leer(foto.clave), {
          name: `${carpeta}/${String(n).padStart(3, '0')}.${extension}`,
        });
        await unaEntrada(zip);
      }
      await zip.finalize();
    } catch (error) {
      this.logger.error(
        `ZIP de la visita ${visita.id} interrumpido`,
        error instanceof Error ? error.stack : String(error),
      );
      zip.abort();
      res.destroy();
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
      relations: { sitio: true, tecnico: true },
    });
    if (
      !visita ||
      (usuario.rol === Rol.TECNICO && visita.tecnicoId !== usuario.id)
    ) {
      throw new NotFoundException('La visita no existe');
    }
    return visita;
  }

  /** Edita el técnico que la registró, un ADMIN o un SUPERVISOR, en cualquier estado. */
  private async buscarParaEditar(
    id: string,
    usuario: UsuarioAutenticado,
  ): Promise<VisitaTecnica> {
    const visita = await this.buscarParaVer(id, usuario);
    if (usuario.rol === Rol.TECNICO && visita.tecnicoId !== usuario.id) {
      throw new ForbiddenException(
        'Solo el técnico de la visita, un supervisor o un administrador puede cambiarla',
      );
    }
    return visita;
  }

  private async exigirSitio(id: string): Promise<string> {
    const sitio = await this.sitios.findOneBy({ id, activo: true });
    if (!sitio) throw new NotFoundException('El sitio no existe');
    return sitio.id;
  }

  /** Registra el sitio que el técnico encontró y todavía no estaba en el sistema. */
  private async crearSitio(
    dto: NonNullable<CrearVisitaDto['sitioNuevo']>,
  ): Promise<string> {
    if (await this.sitios.existsBy({ codigo: dto.codigo })) {
      throw new ConflictException(
        `Ya existe un sitio con el código ${dto.codigo}; elígelo de la lista`,
      );
    }
    const { id } = await this.sitios.save(
      this.sitios.create({
        codigo: dto.codigo,
        nombre: dto.nombre,
        clienteId: null,
        direccion: dto.direccion || null,
      }),
    );
    return id;
  }

  private async exigirHallazgo(
    visitaId: string,
    hallazgoId: string,
  ): Promise<HallazgoVisita> {
    const hallazgo = await this.hallazgos.findOneBy({
      id: hallazgoId,
      visitaId,
    });
    if (!hallazgo) throw new NotFoundException('El hallazgo no existe');
    return hallazgo;
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

  private cargarFoto(visitaId: string, id: string): Promise<FotoVisita> {
    return this.fotos.findOneOrFail({
      where: { id, visitaId },
      relations: { subidoPor: true },
    });
  }

  private async presentarFoto(f: FotoVisita): Promise<FotoVisitaDto> {
    return {
      ...presentarSinUrl(f),
      url: this.storage.configurado
        ? await this.storage.urlParaDescargar(f.clave)
        : null,
    };
  }

  private async borrarArchivos(fotos: FotoVisita[]): Promise<void> {
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

  private async contar(
    repo: Repository<FotoVisita> | Repository<HallazgoVisita>,
    ids: string[],
    condicion?: string,
  ): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const qb = repo
      .createQueryBuilder('f')
      .select('f.visitaId', 'visitaId')
      .addSelect('COUNT(*)', 'total')
      .where('f.visitaId IN (:...ids)', { ids })
      .groupBy('f.visitaId');
    if (condicion) qb.andWhere(condicion);
    const filas = await qb.getRawMany<{ visitaId: string; total: string }>();
    return new Map(filas.map((f) => [f.visitaId, Number(f.total)]));
  }
}

function resumen(
  v: VisitaTecnica,
  cantidadHallazgos: number,
  cantidadFotos: number,
): VisitaResumen {
  return {
    id: v.id,
    estado: v.estado,
    fecha: v.fecha,
    creadoEn: v.creadoEn,
    actualizadoEn: v.actualizadoEn,
    sitio: {
      id: v.sitio!.id,
      codigo: v.sitio!.codigo,
      nombre: v.sitio!.nombre,
    },
    tecnico: { id: v.tecnico!.id, nombre: v.tecnico!.nombre },
    cantidadHallazgos,
    cantidadFotos,
  };
}

function presentarSinUrl(f: FotoVisita): FotoVisitaDto {
  return {
    id: f.id,
    seccion: f.seccion,
    hallazgoId: f.hallazgoId,
    nombreArchivo: f.nombreArchivo,
    comentario: f.comentario,
    tomadaEn: f.tomadaEn,
    subidaEn: f.creadoEn,
    subidoPor: f.subidoPor
      ? { id: f.subidoPor.id, nombre: f.subidoPor.nombre }
      : null,
    url: null,
  };
}

/** Lo que conviene completar antes de marcarla como visitada (solo informa). */
function faltantesDe(v: VisitaDetalle): string[] {
  const faltan: string[] = [];
  if (!v.ubicacion) faltan.push('Registrar la ubicación');
  if (v.epp.length === 0) faltan.push('Fotos con EPP');
  if (v.fachada.length === 0) faltan.push('Foto de la fachada');
  if (v.croquis.length === 0) faltan.push('Croquis con medidas');
  if (v.hallazgos.length === 0) faltan.push('Al menos un ítem');
  for (const h of v.hallazgos) {
    if (h.fotos.length === 0) faltan.push(`Fotos del ítem ${h.posicion}`);
  }
  return faltan;
}

const ORDEN_SECCION: Record<SeccionFotoVisita, number> = {
  [SeccionFotoVisita.EPP]: 1,
  [SeccionFotoVisita.FACHADA]: 2,
  [SeccionFotoVisita.CROQUIS]: 3,
  [SeccionFotoVisita.HALLAZGO]: 4,
  [SeccionFotoVisita.MEDIDA]: 4,
};

function carpetaDe(foto: FotoVisita, hallazgos: HallazgoVisita[]): string {
  switch (foto.seccion) {
    case SeccionFotoVisita.EPP:
      return '1 EPP';
    case SeccionFotoVisita.FACHADA:
      return '2 Fachada';
    case SeccionFotoVisita.CROQUIS:
      return '3 Croquis';
    default: {
      const h = hallazgos.find((x) => x.id === foto.hallazgoId);
      const item = h
        ? `4 Ítems/${String(h.posicion).padStart(2, '0')} ${limpiar(h.descripcion)}`
        : '4 Ítems/Otros';
      // Las fotos con flexómetro van en su propia carpeta dentro del ítem.
      return foto.seccion === SeccionFotoVisita.MEDIDA
        ? `${item}/Medidas`
        : item;
    }
  }
}

/** Espera a que el ZIP termine de escribir la entrada actual, o falla si hubo un error. */
function unaEntrada(zip: ZipArchive): Promise<void> {
  return new Promise((resolve, reject) => {
    const listo = () => {
      zip.off('error', fallo);
      resolve();
    };
    const fallo = (error: Error) => {
      zip.off('entry', listo);
      reject(error);
    };
    zip.once('entry', listo);
    zip.once('error', fallo);
  });
}

/** Quita caracteres que no se permiten en nombres de archivo o carpeta. */
function limpiar(texto: string): string {
  return texto
    .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}
