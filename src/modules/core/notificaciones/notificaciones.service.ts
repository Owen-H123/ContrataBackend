import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import type { UsuarioAutenticado } from '../../../core/auth/types/usuario-autenticado.js';
import type { Rol } from '../../../shared/enums/rol.enum.js';
import { Usuario } from '../usuarios/entities/usuario.entity.js';
import {
  Notificacion,
  type TipoNotificacion,
} from './entities/notificacion.entity.js';

/** Cuántos avisos devuelve la lista; los más antiguos siguen guardados. */
const MAXIMO_LISTA = 50;

export interface NuevoAviso {
  tipo: TipoNotificacion;
  titulo: string;
  detalle?: string | null;
  informeId?: string | null;
  visitaId?: string | null;
}

export interface NotificacionDto {
  id: string;
  tipo: TipoNotificacion;
  titulo: string;
  detalle: string | null;
  informeId: string | null;
  visitaId: string | null;
  leida: boolean;
  creadoEn: Date;
}

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    @InjectRepository(Notificacion)
    private readonly notificaciones: Repository<Notificacion>,
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
  ) {}

  /**
   * Avisa a los destinatarios, sin repetir y sin avisar a quien hizo la acción.
   * Un fallo aquí nunca debe romper la acción que lo originó: solo se registra.
   */
  async avisar(
    destinatarios: string[],
    aviso: NuevoAviso,
    autorId?: string,
  ): Promise<void> {
    const ids = [...new Set(destinatarios)].filter((id) => id !== autorId);
    if (ids.length === 0) return;
    try {
      await this.notificaciones.insert(
        ids.map((usuarioId) => ({
          usuarioId,
          tipo: aviso.tipo,
          titulo: aviso.titulo.slice(0, 160),
          detalle: aviso.detalle?.slice(0, 400) ?? null,
          informeId: aviso.informeId ?? null,
          visitaId: aviso.visitaId ?? null,
        })),
      );
    } catch (error) {
      this.logger.error(
        `No se pudo guardar la notificación «${aviso.titulo}»`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /** Ids de los usuarios activos con alguno de esos roles. */
  async idsConRol(...roles: Rol[]): Promise<string[]> {
    const usuarios = await this.usuarios.find({
      where: { rol: In(roles), activo: true },
      select: { id: true },
    });
    return usuarios.map((u) => u.id);
  }

  /** Los avisos más recientes del usuario, leídos o no. */
  async listar(usuario: UsuarioAutenticado): Promise<NotificacionDto[]> {
    const filas = await this.notificaciones.find({
      where: { usuarioId: usuario.id },
      order: { creadoEn: 'DESC' },
      take: MAXIMO_LISTA,
    });
    return filas.map((n) => ({
      id: n.id,
      tipo: n.tipo,
      titulo: n.titulo,
      detalle: n.detalle,
      informeId: n.informeId,
      visitaId: n.visitaId,
      leida: n.leidaEn !== null,
      creadoEn: n.creadoEn,
    }));
  }

  async contarSinLeer(usuario: UsuarioAutenticado): Promise<{ total: number }> {
    const total = await this.notificaciones.countBy({
      usuarioId: usuario.id,
      leidaEn: IsNull(),
    });
    return { total };
  }

  /** Marca un aviso como leído; solo el dueño puede hacerlo. */
  async marcarLeida(id: string, usuario: UsuarioAutenticado): Promise<void> {
    const aviso = await this.notificaciones.findOneBy({
      id,
      usuarioId: usuario.id,
    });
    if (!aviso) throw new NotFoundException('La notificación no existe');
    if (aviso.leidaEn === null) {
      await this.notificaciones.update(id, { leidaEn: new Date() });
    }
  }

  async marcarTodasLeidas(usuario: UsuarioAutenticado): Promise<void> {
    await this.notificaciones.update(
      { usuarioId: usuario.id, leidaEn: IsNull() },
      { leidaEn: new Date() },
    );
  }
}
