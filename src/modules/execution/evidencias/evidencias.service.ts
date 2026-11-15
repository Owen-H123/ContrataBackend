import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
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
import { IsNull, Repository } from 'typeorm';
import type { UsuarioAutenticado } from '../../../core/auth/types/usuario-autenticado.js';
import type { EtapaEvidencia } from '../../../shared/enums/etapa-evidencia.enum.js';
import { Rol } from '../../../shared/enums/rol.enum.js';
import { StorageService } from '../../../services/storage/storage.service.js';
import type { ItemOrden } from '../../planning/ordenes-compra/entities/item-orden.entity.js';
import { InformesService } from '../informes/informes.service.js';
import {
  type EditarEvidenciaDto,
  EXTENSIONES,
  MAX_BYTES,
  type SolicitarSubidaDto,
} from './dto/evidencia.schema.js';
import { Evidencia, TipoEvidencia } from './entities/evidencia.entity.js';
import {
  type EvidenciaDto,
  presentarEvidencia,
} from './evidencia.presenter.js';

/** Minutos que dura el enlace de subida (debe coincidir con StorageService). */
const SEGUNDOS_SUBIDA = 15 * 60;

const CARPETA_ETAPA: Record<EtapaEvidencia, string> = {
  ANTES: 'Antes',
  PROCESO: 'Proceso',
  DESPUES: 'Después',
};

export interface SubidaDto {
  evidencia: EvidenciaDto;
  /** El celular hace `PUT` a esta URL con el archivo y el header indicado. */
  subida: {
    url: string;
    metodo: 'PUT';
    headers: { 'Content-Type': string };
    expiraEnSegundos: number;
  };
}

/**
 * Fotos del informe. Flujo de subida:
 * 1. `POST /informes/:id/evidencias` → registra la foto y entrega un enlace firmado.
 * 2. El celular sube el archivo directo a R2 con ese enlace.
 * 3. `POST /informes/:id/evidencias/:evidenciaId/confirmar` → se verifica en R2 y la foto aparece.
 */
@Injectable()
export class EvidenciasService {
  private readonly logger = new Logger(EvidenciasService.name);

  constructor(
    @InjectRepository(Evidencia)
    private readonly evidencias: Repository<Evidencia>,
    private readonly informes: InformesService,
    private readonly storage: StorageService,
  ) {}

  async solicitarSubida(
    informeId: string,
    dto: SolicitarSubidaDto,
    usuario: UsuarioAutenticado,
  ): Promise<SubidaDto> {
    const informe = await this.informes.buscarParaEditar(informeId, usuario);
    let itemId: string | null = null;
    let etapa: EtapaEvidencia | null = null;
    let tecnicoId: string | null = null;

    if (dto.tipo === TipoEvidencia.ACTIVIDAD) {
      const items = await this.informes.actividadesDe(informe);
      const item = items.find((i) => i.id === dto.itemId);
      if (!item) {
        throw new NotFoundException('La actividad no es de este informe');
      }
      if (!item.etapas.includes(dto.etapa)) {
        throw new ConflictException(
          `La actividad ${item.posicion} no lleva fotos de ${CARPETA_ETAPA[dto.etapa].toLowerCase()}`,
        );
      }
      itemId = item.id;
      etapa = dto.etapa;
    } else if (dto.tipo === TipoEvidencia.EPP) {
      tecnicoId =
        dto.tecnicoId ?? (usuario.rol === Rol.TECNICO ? usuario.id : null);
      if (!tecnicoId) {
        throw new BadRequestException('Indica qué técnico aparece en la foto');
      }
      if (!informe.tecnicos?.some((t) => t.id === tecnicoId)) {
        throw new ConflictException('Ese técnico no está asignado al informe');
      }
    }

    const id = randomUUID();
    const clave = `informes/${informe.id}/${id}.${EXTENSIONES[dto.tipoContenido]}`;
    // Primero se firma: si R2 no está configurado, falla (503) sin dejar registros.
    const url = await this.storage.urlParaSubir(clave, dto.tipoContenido);

    await this.evidencias.insert({
      id,
      informeId: informe.id,
      tipo: dto.tipo,
      itemId,
      etapa,
      tecnicoId,
      clave,
      nombreArchivo: dto.nombreArchivo,
      tipoContenido: dto.tipoContenido,
      comentario: dto.comentario ?? null,
      tomadaEn: dto.tomadaEn ? new Date(dto.tomadaEn) : null,
      subidoPorId: usuario.id,
    });

    return {
      evidencia: presentarEvidencia(await this.cargar(informe.id, id), null),
      subida: {
        url,
        metodo: 'PUT',
        headers: { 'Content-Type': dto.tipoContenido },
        expiraEnSegundos: SEGUNDOS_SUBIDA,
      },
    };
  }

  /** Verifica en R2 que el archivo llegó; desde ahí la foto cuenta en el informe. */
  async confirmar(
    informeId: string,
    evidenciaId: string,
    usuario: UsuarioAutenticado,
  ): Promise<EvidenciaDto> {
    const informe = await this.informes.buscarParaEditar(informeId, usuario);
    const evidencia = await this.buscarPropia(informe.id, evidenciaId, usuario);

    if (!evidencia.confirmada) {
      const archivo = await this.storage.consultar(evidencia.clave);
      if (!archivo) {
        throw new ConflictException(
          'La foto todavía no llegó al almacenamiento; vuelve a subirla',
        );
      }
      if (archivo.bytes > MAX_BYTES) {
        throw new ConflictException('La foto supera 25 MB');
      }
      await this.evidencias.update(evidencia.id, {
        confirmada: true,
        bytes: archivo.bytes,
      });
    }
    return this.presentar(await this.cargar(informe.id, evidencia.id));
  }

  async editar(
    informeId: string,
    evidenciaId: string,
    dto: EditarEvidenciaDto,
    usuario: UsuarioAutenticado,
  ): Promise<EvidenciaDto> {
    const informe = await this.informes.buscarParaEditar(informeId, usuario);
    const evidencia = await this.buscarPropia(informe.id, evidenciaId, usuario);
    await this.evidencias.update(evidencia.id, { comentario: dto.comentario });
    return this.presentar(await this.cargar(informe.id, evidencia.id));
  }

  /** Quita la foto del informe sin borrar el archivo: queda oculta y registrada. */
  async ocultar(
    informeId: string,
    evidenciaId: string,
    usuario: UsuarioAutenticado,
  ): Promise<void> {
    const informe = await this.informes.buscarParaEditar(informeId, usuario);
    const evidencia = await this.buscarPropia(informe.id, evidenciaId, usuario);
    await this.evidencias.update(evidencia.id, {
      ocultaEn: new Date(),
      ocultaPorId: usuario.id,
    });
  }

  /** Enlace para descargar la foto con su nombre original. */
  async enlaceDescarga(
    informeId: string,
    evidenciaId: string,
    usuario: UsuarioAutenticado,
  ): Promise<{ url: string }> {
    const informe = await this.informes.buscarParaVer(informeId, usuario);
    const evidencia = await this.evidencias.findOneBy({
      id: evidenciaId,
      informeId: informe.id,
      confirmada: true,
      ocultaEn: IsNull(),
    });
    if (!evidencia) throw new NotFoundException('La foto no existe');
    return {
      url: await this.storage.urlParaDescargar(
        evidencia.clave,
        evidencia.nombreArchivo,
      ),
    };
  }

  /**
   * Arma un ZIP con todas las fotos visibles del informe, ordenadas en carpetas:
   * `Actividades/010 CAMBIO DE GRILLETE/Antes/1.jpg`, `EPP/Juan Pérez/1.jpg`, `Fotos generales/1.jpg`.
   * Se transmite a medida que se arma: no se guarda en el servidor.
   */
  async descargarZip(
    informeId: string,
    usuario: UsuarioAutenticado,
    res: Response,
  ): Promise<void> {
    const informe = await this.informes.buscarParaVer(informeId, usuario);
    const [evidencias, items] = await Promise.all([
      this.informes.evidenciasVisibles(informe.id),
      this.informes.actividadesDe(informe),
    ]);
    if (evidencias.length === 0) {
      throw new NotFoundException('El informe todavía no tiene fotos');
    }
    if (!this.storage.configurado) {
      throw new ServiceUnavailableException(
        'El almacenamiento de fotos no está configurado',
      );
    }

    const nombre = limpiar(
      `Informe ${informe.sitio!.codigo} OC ${informe.orden!.numero}`,
    );
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${nombre}.zip"; filename*=UTF-8''${encodeURIComponent(nombre)}.zip`,
    );

    // Las fotos ya vienen comprimidas: se guardan tal cual (store) para no gastar CPU.
    const zip = new ZipArchive({ store: true });
    zip.pipe(res);

    try {
      for (const { evidencia, ruta } of rutasEnZip(evidencias, items)) {
        zip.append(await this.storage.leer(evidencia.clave), { name: ruta });
        // De a una foto: no se abren todas las descargas desde R2 a la vez.
        await unaEntrada(zip);
      }
      await zip.finalize();
    } catch (error) {
      // Las cabeceras ya salieron: no se puede responder con un JSON de error.
      // Se corta la descarga para que el navegador la marque como fallida.
      this.logger.error(
        `ZIP del informe ${informe.id} interrumpido`,
        error instanceof Error ? error.stack : String(error),
      );
      zip.abort();
      res.destroy();
    }
  }

  private async buscarPropia(
    informeId: string,
    evidenciaId: string,
    usuario: UsuarioAutenticado,
  ): Promise<Evidencia> {
    const evidencia = await this.evidencias.findOneBy({
      id: evidenciaId,
      informeId,
      ocultaEn: IsNull(),
    });
    if (!evidencia) throw new NotFoundException('La foto no existe');
    if (usuario.rol !== Rol.ADMIN && evidencia.subidoPorId !== usuario.id) {
      throw new ForbiddenException(
        'Solo quien subió la foto o un administrador puede cambiarla',
      );
    }
    return evidencia;
  }

  private async cargar(informeId: string, id: string): Promise<Evidencia> {
    return this.evidencias.findOneOrFail({
      where: { id, informeId },
      relations: { tecnico: true, subidoPor: true },
    });
  }

  private async presentar(evidencia: Evidencia): Promise<EvidenciaDto> {
    return presentarEvidencia(
      evidencia,
      await this.storage.urlParaDescargar(evidencia.clave),
    );
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

/** Ruta de cada foto dentro del ZIP, numerada dentro de su carpeta. */
function rutasEnZip(
  evidencias: Evidencia[],
  items: ItemOrden[],
): { evidencia: Evidencia; ruta: string }[] {
  const contadores = new Map<string, number>();
  return evidencias.map((evidencia) => {
    const carpeta = carpetaDe(evidencia, items);
    const n = (contadores.get(carpeta) ?? 0) + 1;
    contadores.set(carpeta, n);
    const extension = evidencia.clave.split('.').pop();
    return { evidencia, ruta: `${carpeta}/${n}.${extension}` };
  });
}

function carpetaDe(evidencia: Evidencia, items: ItemOrden[]): string {
  if (evidencia.tipo === TipoEvidencia.EPP) {
    return `EPP/${limpiar(evidencia.tecnico?.nombre ?? 'Técnico')}`;
  }
  if (evidencia.tipo === TipoEvidencia.GENERAL) return 'Fotos generales';

  const item = items.find((i) => i.id === evidencia.itemId);
  const actividad = item
    ? `${String(item.posicion).padStart(3, '0')} ${limpiar(item.descripcion)}`
    : 'Otras';
  const etapa = evidencia.etapa ? CARPETA_ETAPA[evidencia.etapa] : 'Sin etapa';
  return `Actividades/${actividad}/${etapa}`;
}

/** Quita caracteres que no se permiten en nombres de archivo o carpeta. */
function limpiar(texto: string): string {
  return texto
    .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}
