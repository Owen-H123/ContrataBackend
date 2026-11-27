import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  Brackets,
  type FindOptionsWhere,
  ILike,
  In,
  Repository,
} from 'typeorm';
import type { UsuarioAutenticado } from '../../../core/auth/types/usuario-autenticado.js';
import { escaparLike } from '../../../shared/database/escapar-like.js';
import { redondear2 } from '../../../shared/entities/numerico.transformer.js';
import { Permiso } from '../../../shared/enums/permiso.enum.js';
import { Rol } from '../../../shared/enums/rol.enum.js';
import { StorageService } from '../../../services/storage/storage.service.js';
import { TipoNotificacion } from '../../core/notificaciones/entities/notificacion.entity.js';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service.js';
import { Usuario } from '../../core/usuarios/entities/usuario.entity.js';
import { Sitio } from '../../master/sitios/entities/sitio.entity.js';
import { Trabajador } from '../../rrhh/entities/trabajador.entity.js';
import {
  EtapaTrabajo,
  Trabajo,
} from '../../planning/trabajos/entities/trabajo.entity.js';
import { codigoTrabajo } from '../../planning/trabajos/trabajos.service.js';
import {
  type AbonarDto,
  type AprobarDto,
  type CrearSolicitudDto,
  type EditarSolicitudDto,
  EXTENSIONES_SOLICITUD,
  type FiltrosSolicitudDto,
  MAX_ARCHIVOS,
  MAX_BYTES_SOLICITUD,
  type RechazarDto,
  type SubirArchivoDto,
} from './dto/solicitud.schema.js';
import {
  ArchivoSolicitud,
  TipoArchivoSolicitud,
} from './entities/archivo-solicitud.entity.js';
import {
  EstadoSolicitud,
  SolicitudDinero,
  TipoSolicitud,
} from './entities/solicitud-dinero.entity.js';

const SEGUNDOS_SUBIDA = 15 * 60;

/** «SD-0007» */
export const codigoSolicitud = (n: number) =>
  `SD-${String(n).padStart(4, '0')}`;

@Injectable()
export class SolicitudesService {
  private readonly logger = new Logger(SolicitudesService.name);

  constructor(
    @InjectRepository(SolicitudDinero)
    private readonly solicitudes: Repository<SolicitudDinero>,
    @InjectRepository(ArchivoSolicitud)
    private readonly archivos: Repository<ArchivoSolicitud>,
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
    @InjectRepository(Sitio)
    private readonly sitios: Repository<Sitio>,
    @InjectRepository(Trabajador)
    private readonly trabajadores: Repository<Trabajador>,
    private readonly storage: StorageService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  // ---------- Permisos ----------

  /** Permisos actuales del usuario (se leen de la base: si se los quitan, rige al instante). */
  async permisosDe(usuario: UsuarioAutenticado): Promise<Set<Permiso>> {
    if (usuario.rol === Rol.ADMIN) return new Set(Object.values(Permiso));
    const u = await this.usuarios.findOne({
      where: { id: usuario.id },
      select: { id: true, permisos: true },
    });
    return new Set(u?.permisos ?? []);
  }

  private async exigir(
    usuario: UsuarioAutenticado,
    permiso: Permiso,
    mensaje: string,
  ) {
    const permisos = await this.permisosDe(usuario);
    if (!permisos.has(permiso)) throw new ForbiddenException(mensaje);
    return permisos;
  }

  /** Quienes pueden ver todas: los que aprueban o abonan. El resto, solo las suyas. */
  private async veTodas(usuario: UsuarioAutenticado) {
    const p = await this.permisosDe(usuario);
    return p.has(Permiso.APROBAR_DINERO) || p.has(Permiso.ABONAR_DINERO);
  }

  /**
   * A quién avisar: quienes tienen el permiso y, siempre, los administradores (en RYSCOM el
   * administrador es quien aprueba y paga, y puede hacerlo aunque no tenga el permiso marcado).
   */
  private async idsConPermiso(permiso: Permiso): Promise<string[]> {
    const filas = await this.usuarios
      .createQueryBuilder('u')
      .select('u.id', 'id')
      .where('u.activo = true')
      .andWhere(
        new Brackets((w) =>
          w
            .where(':permiso = ANY(u.permisos)', { permiso })
            .orWhere('u.rol = :admin', { admin: Rol.ADMIN }),
        ),
      )
      .getRawMany<{ id: string }>();
    return filas.map((f) => f.id);
  }

  // ---------- Consultas ----------

  async listar(filtros: FiltrosSolicitudDto, usuario: UsuarioAutenticado) {
    const todas = await this.veTodas(usuario);
    const base: FindOptionsWhere<SolicitudDinero> = {};
    const vista = filtros.vista ?? (todas ? 'TODAS' : 'MIAS');
    if (vista === 'MIAS' || !todas) base.solicitanteId = usuario.id;
    if (vista === 'POR_APROBAR') base.estado = EstadoSolicitud.PENDIENTE;
    if (vista === 'POR_ABONAR') base.estado = EstadoSolicitud.APROBADA;
    // Adelantos ya abonados que aún no se rinden con sus boletas.
    if (vista === 'POR_RENDIR') base.estado = EstadoSolicitud.ABONADA;
    if (filtros.estado) base.estado = filtros.estado;
    if (filtros.mes) {
      const [a, m] = filtros.mes.split('-').map(Number);
      const fin = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
      base.fecha = Between(`${filtros.mes}-01`, fin);
    }
    const q = filtros.q ? `%${escaparLike(filtros.q)}%` : null;
    const where = q
      ? [
          { ...base, beneficiario: ILike(q) },
          { ...base, documento: ILike(q) },
          { ...base, concepto: ILike(q) },
          { ...base, centroCosto: ILike(q) },
          { ...base, sitio: { codigo: ILike(q) } },
        ]
      : base;
    const filas = await this.solicitudes.find({
      where,
      relations: { solicitante: true, sitio: true, trabajo: { orden: true } },
      order: { numero: 'DESC' },
      take: 500,
    });
    return filas.map((s) => this.resumen(s));
  }

  /** Cuántas hay en cada bandeja (para los números de las pestañas y el aviso en Inicio). */
  async conteos(usuario: UsuarioAutenticado) {
    const p = await this.permisosDe(usuario);
    const todas = p.has(Permiso.APROBAR_DINERO) || p.has(Permiso.ABONAR_DINERO);
    const [porAprobar, porAbonar, porRendir, misPendientes] = await Promise.all(
      [
        p.has(Permiso.APROBAR_DINERO)
          ? this.solicitudes.countBy({ estado: EstadoSolicitud.PENDIENTE })
          : 0,
        p.has(Permiso.ABONAR_DINERO)
          ? this.solicitudes.countBy({ estado: EstadoSolicitud.APROBADA })
          : 0,
        todas
          ? this.solicitudes.countBy({ estado: EstadoSolicitud.ABONADA })
          : 0,
        this.solicitudes.countBy({
          solicitanteId: usuario.id,
          estado: In([
            EstadoSolicitud.PENDIENTE,
            EstadoSolicitud.APROBADA,
            EstadoSolicitud.ABONADA,
          ]),
        }),
      ],
    );
    return {
      porAprobar,
      porAbonar,
      porRendir,
      misPendientes,
      permisos: [...p],
    };
  }

  async obtener(id: string, usuario: UsuarioAutenticado) {
    const s = await this.cargar(id);
    if (s.solicitanteId !== usuario.id && !(await this.veTodas(usuario)))
      throw new NotFoundException('La solicitud no existe');
    return this.detalle(s, usuario);
  }

  /**
   * Personas a depositar sugeridas al escribir: el personal de RRHH y a quienes ya se
   * depositó antes, con su DNI/RUC, banco y cuenta.
   */
  async beneficiarios(q: string) {
    const patron = `%${escaparLike(q)}%`;
    const [personal, anteriores] = await Promise.all([
      this.trabajadores.find({
        where: [
          { nombres: ILike(patron), activo: true },
          { dni: ILike(patron), activo: true },
        ],
        take: 8,
        order: { nombres: 'ASC' },
      }),
      this.solicitudes
        .createQueryBuilder('s')
        .select([
          's.documento AS documento',
          's.beneficiario AS beneficiario',
          's.banco AS banco',
          's.cuenta AS cuenta',
        ])
        .where('s.beneficiario ILIKE :p OR s.documento ILIKE :p', { p: patron })
        .orderBy('s.numero', 'DESC')
        .limit(30)
        .getRawMany<{
          documento: string;
          beneficiario: string;
          banco: string | null;
          cuenta: string;
        }>(),
    ]);
    const vistos = new Map<
      string,
      {
        documento: string;
        beneficiario: string;
        banco: string | null;
        cuenta: string | null;
        origen: 'PERSONAL' | 'ANTERIOR';
      }
    >();
    for (const a of anteriores)
      if (!vistos.has(a.documento))
        vistos.set(a.documento, { ...a, origen: 'ANTERIOR' });
    for (const t of personal) {
      if (!t.dni || vistos.has(t.dni)) continue;
      vistos.set(t.dni, {
        documento: t.dni,
        beneficiario: t.nombres,
        banco: t.banco,
        cuenta: t.cuenta,
        origen: 'PERSONAL',
      });
    }
    return [...vistos.values()].slice(0, 10);
  }

  // ---------- Pedir ----------

  async crear(dto: CrearSolicitudDto, usuario: UsuarioAutenticado) {
    await this.exigir(
      usuario,
      Permiso.PEDIR_DINERO,
      'No tienes permiso para pedir dinero',
    );
    dto = await this.conTrabajo(dto);
    if (dto.sitioId) await this.exigirSitio(dto.sitioId);
    const { id } = await this.solicitudes.save(
      this.solicitudes.create({
        ...this.limpiar(dto),
        solicitanteId: usuario.id,
      }),
    );
    const s = await this.cargar(id);
    const aprobadores = await this.idsConPermiso(Permiso.APROBAR_DINERO);
    await this.notificaciones.avisar(
      aprobadores,
      {
        tipo: TipoNotificacion.SOLICITUD_NUEVA,
        titulo: `${usuario.nombre} pide S/ ${s.monto.toFixed(2)}`,
        detalle: `${codigoSolicitud(s.numero)} · ${s.concepto ?? 'Sin concepto'} · para ${s.beneficiario}`,
        solicitudId: s.id,
      },
      usuario.id,
    );
    return this.detalle(s, usuario);
  }

  async editar(
    id: string,
    dto: EditarSolicitudDto,
    usuario: UsuarioAutenticado,
  ) {
    const s = await this.propiaPendiente(id, usuario);
    dto = await this.conTrabajo(dto);
    if (dto.sitioId) await this.exigirSitio(dto.sitioId);
    delete s.sitio;
    delete s.trabajo;
    Object.assign(s, this.limpiar(dto));
    await this.solicitudes.save(s);
    return this.detalle(await this.cargar(id), usuario);
  }

  /** Quien la pidió puede anularla mientras nadie la revisó. */
  async anular(id: string, usuario: UsuarioAutenticado) {
    const s = await this.propiaPendiente(id, usuario);
    const archivos = await this.archivos.findBy({ solicitudId: s.id });
    await this.solicitudes.delete(s.id);
    await this.borrarArchivos(archivos);
  }

  // ---------- Revisar ----------

  async aprobar(id: string, dto: AprobarDto, usuario: UsuarioAutenticado) {
    await this.exigir(
      usuario,
      Permiso.APROBAR_DINERO,
      'No tienes permiso para aprobar solicitudes',
    );
    const s = await this.cargar(id);
    this.exigirEstado(
      s,
      EstadoSolicitud.PENDIENTE,
      'Solo se aprueba una solicitud pendiente',
    );
    this.noPropia(s, usuario, 'aprobar');
    if (dto.montoAprobado && dto.montoAprobado > s.monto)
      throw new BadRequestException('No se puede aprobar más de lo pedido');
    if (
      s.tipo === TipoSolicitud.REEMBOLSO &&
      !this.confirmados(s, TipoArchivoSolicitud.SUSTENTO).length
    )
      throw new BadRequestException(
        'Es un reembolso: primero deben subirse las boletas o facturas',
      );
    Object.assign(s, {
      estado: EstadoSolicitud.APROBADA,
      montoAprobado: dto.montoAprobado ?? s.monto,
      revisadoPorId: usuario.id,
      revisadoEn: new Date(),
      comentarioRevision: dto.comentario ?? null,
    });
    delete s.revisadoPor;
    await this.solicitudes.save(s);
    const abonadores = await this.idsConPermiso(Permiso.ABONAR_DINERO);
    await this.notificaciones.avisar(
      [s.solicitanteId],
      {
        tipo: TipoNotificacion.SOLICITUD_ESTADO,
        titulo: `Aprobaron tu solicitud ${codigoSolicitud(s.numero)}`,
        detalle: `S/ ${s.montoAprobado!.toFixed(2)}${s.montoAprobado! < s.monto ? ` de S/ ${s.monto.toFixed(2)} pedidos` : ''}${dto.comentario ? ` · ${dto.comentario}` : ''}`,
        solicitudId: s.id,
      },
      usuario.id,
    );
    await this.notificaciones.avisar(
      abonadores,
      {
        tipo: TipoNotificacion.SOLICITUD_ESTADO,
        titulo: `Por abonar: S/ ${s.montoAprobado!.toFixed(2)} a ${s.beneficiario}`,
        detalle: `${codigoSolicitud(s.numero)} · aprobada por ${usuario.nombre}`,
        solicitudId: s.id,
      },
      usuario.id,
    );
    return this.detalle(await this.cargar(id), usuario);
  }

  async rechazar(id: string, dto: RechazarDto, usuario: UsuarioAutenticado) {
    await this.exigir(
      usuario,
      Permiso.APROBAR_DINERO,
      'No tienes permiso para rechazar solicitudes',
    );
    const s = await this.cargar(id);
    this.exigirEstado(
      s,
      EstadoSolicitud.PENDIENTE,
      'Solo se rechaza una solicitud pendiente',
    );
    this.noPropia(s, usuario, 'rechazar');
    Object.assign(s, {
      estado: EstadoSolicitud.RECHAZADA,
      revisadoPorId: usuario.id,
      revisadoEn: new Date(),
      comentarioRevision: dto.motivo,
    });
    delete s.revisadoPor;
    await this.solicitudes.save(s);
    await this.notificaciones.avisar(
      [s.solicitanteId],
      {
        tipo: TipoNotificacion.SOLICITUD_ESTADO,
        titulo: `Rechazaron tu solicitud ${codigoSolicitud(s.numero)}`,
        detalle: dto.motivo,
        solicitudId: s.id,
      },
      usuario.id,
    );
    return this.detalle(await this.cargar(id), usuario);
  }

  // ---------- Abonar y rendir ----------

  async abonar(id: string, dto: AbonarDto, usuario: UsuarioAutenticado) {
    await this.exigir(
      usuario,
      Permiso.ABONAR_DINERO,
      'No tienes permiso para abonar solicitudes',
    );
    const s = await this.cargar(id);
    this.exigirEstado(
      s,
      EstadoSolicitud.APROBADA,
      'Solo se abona una solicitud aprobada',
    );
    // Solo el adelanto se rinde después. El reembolso ya trae sus boletas y el
    // pago directo no se rinde: con el abono quedan cerrados.
    const cierra = s.tipo !== TipoSolicitud.ADELANTO;
    Object.assign(s, {
      estado: cierra ? EstadoSolicitud.RENDIDA : EstadoSolicitud.ABONADA,
      abonadoPorId: usuario.id,
      abonadoEn: dto.abonadoEn,
      medioAbono: dto.medioAbono,
      operacion: dto.operacion ?? null,
      rendidoEn: cierra ? new Date() : null,
    });
    delete s.abonadoPor;
    await this.solicitudes.save(s);
    await this.notificaciones.avisar(
      [s.solicitanteId],
      {
        tipo: TipoNotificacion.SOLICITUD_ESTADO,
        titulo: `Abonaron tu solicitud ${codigoSolicitud(s.numero)}`,
        detalle: `S/ ${(s.montoAprobado ?? s.monto).toFixed(2)} a ${s.beneficiario}${s.tipo === TipoSolicitud.ADELANTO ? ' · recuerda subir las boletas para rendir' : ''}`,
        solicitudId: s.id,
      },
      usuario.id,
    );
    return this.detalle(await this.cargar(id), usuario);
  }

  /** Quien pidió un adelanto lo rinde con sus boletas. */
  async rendir(id: string, usuario: UsuarioAutenticado) {
    const s = await this.cargar(id);
    if (s.solicitanteId !== usuario.id && usuario.rol !== Rol.ADMIN)
      throw new ForbiddenException('Solo quien pidió el dinero lo rinde');
    this.exigirEstado(
      s,
      EstadoSolicitud.ABONADA,
      'Solo se rinde una solicitud ya abonada',
    );
    if (!this.confirmados(s, TipoArchivoSolicitud.SUSTENTO).length)
      throw new BadRequestException(
        'Sube al menos una boleta o factura para rendir',
      );
    s.estado = EstadoSolicitud.RENDIDA;
    s.rendidoEn = new Date();
    await this.solicitudes.save(s);
    const aprobadores = await this.idsConPermiso(Permiso.APROBAR_DINERO);
    const r = this.rendicion(s);
    await this.notificaciones.avisar(
      aprobadores,
      {
        tipo: TipoNotificacion.SOLICITUD_ESTADO,
        titulo: `${usuario.nombre} rindió ${codigoSolicitud(s.numero)}`,
        detalle: `Gastó S/ ${r.gastado.toFixed(2)} de S/ ${r.recibido.toFixed(2)}`,
        solicitudId: s.id,
      },
      usuario.id,
    );
    return this.detalle(await this.cargar(id), usuario);
  }

  // ---------- Archivos ----------

  async solicitarSubida(
    id: string,
    dto: SubirArchivoDto,
    usuario: UsuarioAutenticado,
  ) {
    const s = await this.cargar(id);
    const permisos = await this.permisosDe(usuario);
    if (dto.tipo === TipoArchivoSolicitud.SUSTENTO) {
      if (s.solicitanteId !== usuario.id && usuario.rol !== Rol.ADMIN)
        throw new ForbiddenException(
          'Las boletas las sube quien pidió el dinero',
        );
      if (
        ![EstadoSolicitud.PENDIENTE, EstadoSolicitud.ABONADA].includes(s.estado)
      )
        throw new ConflictException('En este estado ya no se agregan boletas');
    } else {
      if (!permisos.has(Permiso.ABONAR_DINERO))
        throw new ForbiddenException('El voucher lo sube quien abona');
      if (
        ![
          EstadoSolicitud.APROBADA,
          EstadoSolicitud.ABONADA,
          EstadoSolicitud.RENDIDA,
        ].includes(s.estado)
      )
        throw new ConflictException('El voucher se sube al abonar');
    }
    const ya = (s.archivos ?? []).filter((a) => a.tipo === dto.tipo).length;
    if (ya >= MAX_ARCHIVOS)
      throw new ConflictException(
        `Ya hay ${MAX_ARCHIVOS} archivos; quita alguno`,
      );

    const archivoId = randomUUID();
    const clave = `solicitudes/${s.id}/${archivoId}.${EXTENSIONES_SOLICITUD[dto.tipoContenido]}`;
    const url = await this.storage.urlParaSubir(clave, dto.tipoContenido);
    await this.archivos.insert({
      id: archivoId,
      solicitudId: s.id,
      tipo: dto.tipo,
      clave,
      nombreArchivo: dto.nombreArchivo,
      tipoContenido: dto.tipoContenido,
      monto: dto.monto ?? null,
      subidoPorId: usuario.id,
    });
    return {
      archivoId,
      subida: {
        url,
        metodo: 'PUT',
        headers: { 'Content-Type': dto.tipoContenido },
        expiraEnSegundos: SEGUNDOS_SUBIDA,
      },
    };
  }

  async confirmarArchivo(
    id: string,
    archivoId: string,
    usuario: UsuarioAutenticado,
  ) {
    const a = await this.archivoPropio(id, archivoId, usuario);
    if (!a.confirmado) {
      const guardado = await this.storage.consultar(a.clave);
      if (!guardado)
        throw new ConflictException(
          'El archivo todavía no llegó; vuelve a subirlo',
        );
      if (guardado.bytes > MAX_BYTES_SOLICITUD)
        throw new ConflictException('El archivo supera 10 MB');
      await this.archivos.update(a.id, {
        confirmado: true,
        bytes: guardado.bytes,
      });
    }
    return this.detalle(await this.cargar(id), usuario);
  }

  async quitarArchivo(
    id: string,
    archivoId: string,
    usuario: UsuarioAutenticado,
  ) {
    const a = await this.archivoPropio(id, archivoId, usuario);
    const s = await this.cargar(id);
    if (s.estado === EstadoSolicitud.RENDIDA)
      throw new ConflictException(
        'La solicitud ya está rendida: sus archivos no se quitan',
      );
    await this.archivos.delete(a.id);
    await this.borrarArchivos([a]);
    return this.detalle(await this.cargar(id), usuario);
  }

  // ---------- Ayudas ----------

  private limpiar<T extends CrearSolicitudDto>(dto: T) {
    return {
      ...dto,
      sitioId: dto.sitioId ?? null,
      trabajoId: dto.trabajoId ?? null,
      centroCosto: dto.sitioId
        ? null
        : (dto.centroCosto?.toUpperCase() ?? null),
      banco: dto.banco ?? null,
      concepto: dto.concepto ?? null,
      beneficiario: dto.beneficiario.toUpperCase(),
    };
  }

  private async cargar(id: string) {
    const s = await this.solicitudes.findOne({
      where: { id },
      relations: {
        solicitante: true,
        sitio: true,
        trabajo: { orden: true },
        revisadoPor: true,
        abonadoPor: true,
        archivos: { subidoPor: true },
      },
    });
    if (!s) throw new NotFoundException('La solicitud no existe');
    return s;
  }

  private trabajoBreve(t: Trabajo) {
    return {
      id: t.id,
      codigo: codigoTrabajo(t.numero),
      descripcion: t.descripcion,
      sitioId: t.sitioId,
      oc: t.orden?.numero ?? t.ocNumero,
    };
  }

  /**
   * Trabajos para elegir en la solicitud (quien pide dinero no entra al seguimiento): los
   * abiertos del sitio, o los que coinciden con lo que escribe.
   */
  async trabajosParaElegir(f: { q?: string; sitioId?: string }) {
    const qb = this.solicitudes.manager
      .getRepository(Trabajo)
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.sitio', 'sitio')
      .leftJoinAndSelect('t.orden', 'orden')
      .where('t.etapa NOT IN (:...cerrados)', {
        cerrados: [EtapaTrabajo.COBRADO, EtapaTrabajo.CANCELADO],
      })
      .orderBy('t.solicitado_en', 'DESC')
      .take(15);
    if (f.sitioId) qb.andWhere('t.sitio_id = :s', { s: f.sitioId });
    if (f.q)
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('t.descripcion ILIKE :q')
            .orWhere('sitio.codigo ILIKE :q')
            .orWhere('sitio.nombre ILIKE :q')
            .orWhere('t.oc_numero ILIKE :q')
            .orWhere('orden.numero ILIKE :q')
            .orWhere("CONCAT('TR-', LPAD(t.numero::text, 4, '0')) ILIKE :q"),
        ),
        { q: `%${f.q}%` },
      );
    return (await qb.getMany()).map((t) => ({
      ...this.trabajoBreve(t),
      sitio: t.sitio
        ? { id: t.sitio.id, codigo: t.sitio.codigo, nombre: t.sitio.nombre }
        : null,
    }));
  }

  /** El trabajo tiene que existir; si no se eligió sitio, se toma el del trabajo. */
  private async conTrabajo<
    T extends {
      trabajoId?: string | null;
      sitioId?: string | null;
      centroCosto?: string | null;
    },
  >(dto: T): Promise<T> {
    if (!dto.trabajoId) return dto;
    const t = await this.solicitudes.manager.findOneBy(Trabajo, {
      id: dto.trabajoId,
    });
    if (!t) throw new NotFoundException('El trabajo no existe');
    return dto.sitioId || dto.centroCosto
      ? dto
      : { ...dto, sitioId: t.sitioId };
  }

  private async exigirSitio(id: string) {
    if (!(await this.sitios.existsBy({ id })))
      throw new NotFoundException('El sitio no existe');
  }

  private async propiaPendiente(id: string, usuario: UsuarioAutenticado) {
    const s = await this.cargar(id);
    if (s.solicitanteId !== usuario.id && usuario.rol !== Rol.ADMIN)
      throw new ForbiddenException('Solo quien la pidió puede cambiarla');
    this.exigirEstado(
      s,
      EstadoSolicitud.PENDIENTE,
      'Ya fue revisada: no se puede cambiar',
    );
    return s;
  }

  private exigirEstado(
    s: SolicitudDinero,
    estado: EstadoSolicitud,
    mensaje: string,
  ) {
    if (s.estado !== estado) throw new ConflictException(mensaje);
  }

  /** Nadie aprueba ni rechaza lo que pidió él mismo. */
  private noPropia(
    s: SolicitudDinero,
    usuario: UsuarioAutenticado,
    accion: string,
  ) {
    if (s.solicitanteId === usuario.id)
      throw new ForbiddenException(
        `No puedes ${accion} tu propia solicitud: la revisa otra persona`,
      );
  }

  private async archivoPropio(
    id: string,
    archivoId: string,
    usuario: UsuarioAutenticado,
  ) {
    const a = await this.archivos.findOneBy({ id: archivoId, solicitudId: id });
    if (!a) throw new NotFoundException('El archivo no existe');
    if (a.subidoPorId !== usuario.id && usuario.rol !== Rol.ADMIN)
      throw new ForbiddenException(
        'Solo quien subió el archivo puede cambiarlo',
      );
    return a;
  }

  private confirmados(s: SolicitudDinero, tipo: TipoArchivoSolicitud) {
    return (s.archivos ?? []).filter((a) => a.confirmado && a.tipo === tipo);
  }

  /** Lo recibido frente a lo gastado según las boletas. */
  private rendicion(s: SolicitudDinero) {
    const recibido = s.abonadoEn ? (s.montoAprobado ?? s.monto) : 0;
    const gastado = redondear2(
      this.confirmados(s, TipoArchivoSolicitud.SUSTENTO).reduce(
        (t, a) => t + (a.monto ?? 0),
        0,
      ),
    );
    return { recibido, gastado, diferencia: redondear2(recibido - gastado) };
  }

  private resumen(s: SolicitudDinero) {
    return {
      id: s.id,
      numero: s.numero,
      codigo: codigoSolicitud(s.numero),
      fecha: s.fecha,
      estado: s.estado,
      tipo: s.tipo,
      monto: s.monto,
      montoAprobado: s.montoAprobado,
      beneficiario: s.beneficiario,
      documento: s.documento,
      concepto: s.concepto,
      centroCosto: s.sitio ? s.sitio.codigo : s.centroCosto,
      sitio: s.sitio
        ? { id: s.sitio.id, codigo: s.sitio.codigo, nombre: s.sitio.nombre }
        : null,
      trabajo: s.trabajo ? this.trabajoBreve(s.trabajo) : null,
      solicitante: s.solicitante
        ? { id: s.solicitante.id, nombre: s.solicitante.nombre }
        : null,
      creadoEn: s.creadoEn,
    };
  }

  private async detalle(s: SolicitudDinero, usuario: UsuarioAutenticado) {
    const permisos = await this.permisosDe(usuario);
    const propia = s.solicitanteId === usuario.id;
    const archivos = await Promise.all(
      (s.archivos ?? [])
        .filter((a) => a.confirmado)
        .sort((a, b) => a.creadoEn.getTime() - b.creadoEn.getTime())
        .map(async (a) => ({
          id: a.id,
          tipo: a.tipo,
          nombreArchivo: a.nombreArchivo,
          tipoContenido: a.tipoContenido,
          monto: a.monto,
          subidoPor: a.subidoPor
            ? { id: a.subidoPor.id, nombre: a.subidoPor.nombre }
            : null,
          url: this.storage.configurado
            ? await this.storage.urlParaDescargar(a.clave)
            : null,
        })),
    );
    return {
      ...this.resumen(s),
      banco: s.banco,
      cuenta: s.cuenta,
      revisadoPor: s.revisadoPor
        ? { id: s.revisadoPor.id, nombre: s.revisadoPor.nombre }
        : null,
      revisadoEn: s.revisadoEn,
      comentarioRevision: s.comentarioRevision,
      abonadoPor: s.abonadoPor
        ? { id: s.abonadoPor.id, nombre: s.abonadoPor.nombre }
        : null,
      abonadoEn: s.abonadoEn,
      medioAbono: s.medioAbono,
      operacion: s.operacion,
      rendidoEn: s.rendidoEn,
      archivos,
      rendicion: this.rendicion(s),
      /** Lo que este usuario puede hacer con la solicitud ahora. */
      acciones: {
        editar:
          (propia || usuario.rol === Rol.ADMIN) &&
          s.estado === EstadoSolicitud.PENDIENTE,
        revisar:
          permisos.has(Permiso.APROBAR_DINERO) &&
          !propia &&
          s.estado === EstadoSolicitud.PENDIENTE,
        abonar:
          permisos.has(Permiso.ABONAR_DINERO) &&
          s.estado === EstadoSolicitud.APROBADA,
        subirSustento:
          (propia || usuario.rol === Rol.ADMIN) &&
          [EstadoSolicitud.PENDIENTE, EstadoSolicitud.ABONADA].includes(
            s.estado,
          ),
        subirVoucher:
          permisos.has(Permiso.ABONAR_DINERO) &&
          [
            EstadoSolicitud.APROBADA,
            EstadoSolicitud.ABONADA,
            EstadoSolicitud.RENDIDA,
          ].includes(s.estado),
        rendir:
          (propia || usuario.rol === Rol.ADMIN) &&
          s.estado === EstadoSolicitud.ABONADA,
      },
    };
  }

  private async borrarArchivos(archivos: ArchivoSolicitud[]) {
    for (const a of archivos) {
      try {
        await this.storage.borrar(a.clave);
      } catch (error) {
        this.logger.warn(`No se pudo borrar ${a.clave}: ${String(error)}`);
      }
    }
  }
}
