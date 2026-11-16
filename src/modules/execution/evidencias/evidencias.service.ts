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
import { IsNull, MoreThan, Not, Repository } from 'typeorm';
import type { UsuarioAutenticado } from '../../../core/auth/types/usuario-autenticado.js';
import type { EtapaEvidencia } from '../../../shared/enums/etapa-evidencia.enum.js';
import { Rol } from '../../../shared/enums/rol.enum.js';
import { TipoNotificacion } from '../../core/notificaciones/entities/notificacion.entity.js';
import { NotificacionesService } from '../../core/notificaciones/notificaciones.service.js';
import { StorageService } from '../../../services/storage/storage.service.js';
import type { ItemOrden } from '../../planning/ordenes-compra/entities/item-orden.entity.js';
import { MAXIMO_FOTOS } from '../informes/completitud.js';
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
  DURANTE: 'Durante',
  FINALIZADO: 'Finalizado',
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
    private readonly notificaciones: NotificacionesService,
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
    } else if (dto.tipo === TipoEvidencia.EPP && dto.tecnicoId) {
      // El técnico que aparece en la foto es opcional; si se indica, debe estar asignado.
      tecnicoId = dto.tecnicoId;
      if (!informe.tecnicos?.some((t) => t.id === tecnicoId)) {
        throw new ConflictException('Ese técnico no está asignado al informe');
      }
    }

    await this.verificarCupo(informe.id, dto.tipo, itemId, etapa);

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

  /**
   * Cada espacio (etapa de una actividad o grupo general) admite hasta MAXIMO_FOTOS
   * fotos visibles. Cuentan las confirmadas y las subidas en curso (su enlace aún
   * no vence), para que subir varias a la vez desde el celular tampoco pase del tope.
   */
  private async verificarCupo(
    informeId: string,
    tipo: TipoEvidencia,
    itemId: string | null,
    etapa: EtapaEvidencia | null,
  ): Promise<void> {
    const espacio = {
      informeId,
      tipo,
      itemId: itemId ?? IsNull(),
      etapa: etapa ?? IsNull(),
      ocultaEn: IsNull(),
    };
    const enCurso = new Date(Date.now() - SEGUNDOS_SUBIDA * 1000);
    const ocupadas = await this.evidencias.count({
      where: [
        { ...espacio, confirmada: true },
        { ...espacio, confirmada: false, creadoEn: MoreThan(enCurso) },
      ],
    });
    if (ocupadas >= MAXIMO_FOTOS) {
      throw new ConflictException(
        `Ya hay ${MAXIMO_FOTOS} fotos en este espacio, que es el máximo; descarta alguna para subir otra`,
      );
    }
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

  /**
   * Quita la foto del informe sin borrar el archivo: queda descartada y registrada.
   * El autor puede quitar la suya mientras la ejecución está abierta; un ADMIN
   * puede descartar cualquiera, también al revisar con la ejecución finalizada.
   */
  async ocultar(
    informeId: string,
    evidenciaId: string,
    usuario: UsuarioAutenticado,
  ): Promise<void> {
    const informe =
      usuario.rol === Rol.ADMIN
        ? await this.informes.buscarParaVer(informeId, usuario)
        : await this.informes.buscarParaEditar(informeId, usuario);
    const evidencia = await this.buscarPropia(informe.id, evidenciaId, usuario);
    // Sin confirmar es solo una reserva de cupo (la subida falló o se abandonó):
    // se borra para liberar el espacio al instante. No es evidencia ni avisa a nadie.
    if (!evidencia.confirmada) {
      await this.evidencias.delete(evidencia.id);
      return;
    }
    await this.evidencias.update(evidencia.id, {
      ocultaEn: new Date(),
      ocultaPorId: usuario.id,
    });
    // Si la descartó otra persona, el autor se entera; el texto lleva solo el sitio.
    await this.notificaciones.avisar(
      [evidencia.subidoPorId],
      {
        tipo: TipoNotificacion.FOTO_DESCARTADA,
        titulo:
          `Descartaron una de tus fotos: ${informe.sitio?.codigo ?? ''}`.trim(),
        detalle: evidencia.comentario ?? informe.sitio?.nombre ?? null,
        informeId: informe.id,
      },
      usuario.id,
    );
  }

  /** Devuelve al informe una foto descartada (solo ADMIN). */
  async restaurar(
    informeId: string,
    evidenciaId: string,
    usuario: UsuarioAutenticado,
  ): Promise<EvidenciaDto> {
    const informe = await this.informes.buscarParaVer(informeId, usuario);
    const evidencia = await this.evidencias.findOneBy({
      id: evidenciaId,
      informeId: informe.id,
      confirmada: true,
      ocultaEn: Not(IsNull()),
    });
    if (!evidencia) throw new NotFoundException('La foto descartada no existe');
    await this.verificarCupo(
      informe.id,
      evidencia.tipo,
      evidencia.itemId,
      evidencia.etapa,
    );
    await this.evidencias.update(evidencia.id, {
      ocultaEn: null,
      ocultaPorId: null,
    });
    return this.presentar(await this.cargar(informe.id, evidencia.id));
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

    // El técnico no ve la orden de compra: su ZIP lleva solo el código del sitio.
    const nombre = limpiar(
      usuario.rol === Rol.TECNICO
        ? `Informe ${informe.sitio!.codigo}`
        : `Informe ${informe.sitio!.codigo} OC ${informe.orden!.numero}`,
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

/** Orden de las carpetas en el ZIP: primero el sitio, luego el EPP y al final los trabajos. */
const ORDEN_TIPO: Record<TipoEvidencia, number> = {
  [TipoEvidencia.PANORAMICA]: 1,
  [TipoEvidencia.ESTACION]: 2,
  [TipoEvidencia.EPP]: 3,
  [TipoEvidencia.ACTIVIDAD]: 4,
};

const ORDEN_ETAPA: Record<EtapaEvidencia, number> = {
  ANTES: 1,
  DURANTE: 2,
  FINALIZADO: 3,
};

/**
 * Ruta de cada foto dentro del ZIP. Todo lleva números para que, al ordenar por
 * nombre, quede en la secuencia del informe: sitio, EPP y luego cada trabajo con
 * sus etapas; dentro de cada carpeta, por hora en que se tomó la foto.
 */
function rutasEnZip(
  evidencias: Evidencia[],
  items: ItemOrden[],
): { evidencia: Evidencia; ruta: string }[] {
  const posicion = new Map(items.map((i) => [i.id, i.posicion]));
  const momento = (e: Evidencia) => (e.tomadaEn ?? e.creadoEn).getTime();
  const ordenadas = [...evidencias].sort(
    (a, b) =>
      ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] ||
      (posicion.get(a.itemId ?? '') ?? 0) -
        (posicion.get(b.itemId ?? '') ?? 0) ||
      (a.etapa ? ORDEN_ETAPA[a.etapa] : 0) -
        (b.etapa ? ORDEN_ETAPA[b.etapa] : 0) ||
      momento(a) - momento(b),
  );

  const contadores = new Map<string, number>();
  return ordenadas.map((evidencia) => {
    const carpeta = carpetaDe(evidencia, items);
    const n = (contadores.get(carpeta) ?? 0) + 1;
    contadores.set(carpeta, n);
    const extension = evidencia.clave.split('.').pop();
    return {
      evidencia,
      ruta: `${carpeta}/${String(n).padStart(3, '0')}.${extension}`,
    };
  });
}

function carpetaDe(evidencia: Evidencia, items: ItemOrden[]): string {
  switch (evidencia.tipo) {
    case TipoEvidencia.PANORAMICA:
      return '1 Estado del sitio/1 Panorámicas de la torre';
    case TipoEvidencia.ESTACION:
      return '1 Estado del sitio/2 Estaciones y equipos';
    case TipoEvidencia.EPP:
      return '2 EPP';
    default: {
      const item = items.find((i) => i.id === evidencia.itemId);
      const actividad = item
        ? `${String(item.posicion).padStart(3, '0')} ${limpiar(item.descripcion)}`
        : 'Otras';
      const etapa = evidencia.etapa
        ? `${ORDEN_ETAPA[evidencia.etapa]} ${CARPETA_ETAPA[evidencia.etapa]}`
        : 'Sin etapa';
      return `3 Ejecución/${actividad}/${etapa}`;
    }
  }
}

/** Quita caracteres que no se permiten en nombres de archivo o carpeta. */
function limpiar(texto: string): string {
  return texto
    .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}
