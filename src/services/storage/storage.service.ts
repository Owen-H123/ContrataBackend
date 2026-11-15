import {
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, stat } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../core/config/env.schema.js';

/** Minutos que dura un enlace para subir una foto. */
export const MINUTOS_SUBIDA = 15;
/** Minutos que dura un enlace para ver o descargar una foto. */
export const MINUTOS_DESCARGA = 60;

export interface ArchivoGuardado {
  bytes: number;
  tipoContenido: string | undefined;
}

/** Lo que la aplicación necesita de un almacén de fotos. */
interface Almacen {
  urlParaSubir(clave: string, tipoContenido: string): Promise<string>;
  urlParaDescargar(clave: string, nombreDescarga?: string): Promise<string>;
  consultar(clave: string): Promise<ArchivoGuardado | null>;
  leer(clave: string): Promise<Readable>;
}

/**
 * Fotos del sistema. Dos motores con el mismo contrato:
 *
 * - **R2** (producción): el celular sube y descarga directo de Cloudflare con
 *   enlaces firmados de corta duración; la foto no pasa por la API y el bucket
 *   sigue privado. Se activa con las cuatro variables `R2_*`.
 * - **Local** (desarrollo o un solo servidor): los archivos van a una carpeta
 *   del disco y la propia API los recibe y entrega por `/api/archivos/...`,
 *   también con enlaces firmados. Se activa con `STORAGE_LOCAL_DIR`.
 *
 * Las fotos no se borran desde aquí: se conservan aunque se oculten en la app.
 */
@Injectable()
export class StorageService implements Almacen {
  private readonly almacen: Almacen | null;
  /** 'r2', 'local' o null si no hay ninguno configurado. */
  readonly motor: 'r2' | 'local' | null;

  constructor(config: ConfigService<Env, true>) {
    const r2 = AlmacenR2.desde(config);
    const local = r2 ? null : AlmacenLocal.desde(config);
    this.almacen = r2 ?? local;
    this.motor = r2 ? 'r2' : local ? 'local' : null;
    if (local) {
      new Logger(StorageService.name).warn(
        `Fotos en disco local (${local.carpeta}). Para producción configura R2.`,
      );
    }
  }

  /** true cuando hay un almacén configurado (R2 o local). */
  get configurado(): boolean {
    return this.almacen !== null;
  }

  /**
   * Enlace para que el navegador suba un archivo con `PUT`.
   * El navegador debe enviar el mismo `Content-Type` que se firmó.
   */
  async urlParaSubir(clave: string, tipoContenido: string): Promise<string> {
    return this.activo().urlParaSubir(clave, tipoContenido);
  }

  /**
   * Enlace para ver un archivo. Con `nombreDescarga`, el navegador lo descarga
   * con ese nombre en vez de mostrarlo.
   */
  async urlParaDescargar(
    clave: string,
    nombreDescarga?: string,
  ): Promise<string> {
    return this.activo().urlParaDescargar(clave, nombreDescarga);
  }

  /** Confirma que el archivo llegó; null si no existe. */
  async consultar(clave: string): Promise<ArchivoGuardado | null> {
    return this.activo().consultar(clave);
  }

  /** Lee el archivo como stream (para armar el ZIP del informe en el servidor). */
  async leer(clave: string): Promise<Readable> {
    return this.activo().leer(clave);
  }

  /** El almacén local, si es el activo (lo usa el controlador de /archivos). */
  get local(): AlmacenLocal | null {
    return this.almacen instanceof AlmacenLocal ? this.almacen : null;
  }

  private activo(): Almacen {
    if (!this.almacen) {
      throw new ServiceUnavailableException(
        'El almacenamiento de fotos no está configurado',
      );
    }
    return this.almacen;
  }
}

class AlmacenR2 implements Almacen {
  private constructor(
    private readonly cliente: S3Client,
    private readonly bucket: string,
  ) {}

  static desde(config: ConfigService<Env, true>): AlmacenR2 | null {
    const cuenta = config.get('R2_ACCOUNT_ID', { infer: true });
    const accessKeyId = config.get('R2_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('R2_SECRET_ACCESS_KEY', { infer: true });
    const bucket = config.get('R2_BUCKET', { infer: true });
    if (!cuenta || !accessKeyId || !secretAccessKey || !bucket) return null;
    return new AlmacenR2(
      new S3Client({
        region: 'auto',
        endpoint: `https://${cuenta}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      }),
      bucket,
    );
  }

  urlParaSubir(clave: string, tipoContenido: string): Promise<string> {
    return getSignedUrl(
      this.cliente,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: clave,
        ContentType: tipoContenido,
      }),
      { expiresIn: MINUTOS_SUBIDA * 60 },
    );
  }

  urlParaDescargar(clave: string, nombreDescarga?: string): Promise<string> {
    return getSignedUrl(
      this.cliente,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: clave,
        ResponseContentDisposition: nombreDescarga
          ? `attachment; filename="${limpiarNombre(nombreDescarga)}"`
          : undefined,
      }),
      { expiresIn: MINUTOS_DESCARGA * 60 },
    );
  }

  async consultar(clave: string): Promise<ArchivoGuardado | null> {
    try {
      const res = await this.cliente.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: clave }),
      );
      return { bytes: res.ContentLength ?? 0, tipoContenido: res.ContentType };
    } catch (error) {
      if (error instanceof NotFound) return null;
      throw error;
    }
  }

  async leer(clave: string): Promise<Readable> {
    const res = await this.cliente.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: clave }),
    );
    return res.Body as Readable;
  }
}

/**
 * Archivos en una carpeta del servidor, entregados por `/api/archivos/<clave>`.
 * Los enlaces llevan una firma HMAC con vencimiento, así nadie puede subir o
 * leer un archivo sin haber pasado por la API.
 */
export class AlmacenLocal implements Almacen {
  private constructor(
    readonly carpeta: string,
    private readonly baseUrl: string,
    private readonly secreto: string,
  ) {}

  static desde(config: ConfigService<Env, true>): AlmacenLocal | null {
    const carpeta = config.get('STORAGE_LOCAL_DIR', { infer: true });
    if (!carpeta) return null;
    const puerto = config.get('PORT', { infer: true });
    const base =
      config.get('PUBLIC_API_URL', { infer: true }) ??
      `http://localhost:${puerto}/api`;
    return new AlmacenLocal(
      carpeta,
      base.replace(/\/$/, ''),
      config.get('JWT_SECRET', { infer: true }),
    );
  }

  urlParaSubir(clave: string, tipoContenido: string): Promise<string> {
    return Promise.resolve(
      this.enlace(clave, 'PUT', MINUTOS_SUBIDA, { tipo: tipoContenido }),
    );
  }

  urlParaDescargar(clave: string, nombreDescarga?: string): Promise<string> {
    return Promise.resolve(
      this.enlace(clave, 'GET', MINUTOS_DESCARGA, {
        ...(nombreDescarga && { nombre: limpiarNombre(nombreDescarga) }),
      }),
    );
  }

  async consultar(clave: string): Promise<ArchivoGuardado | null> {
    try {
      const info = await stat(this.ruta(clave));
      return { bytes: info.size, tipoContenido: undefined };
    } catch {
      return null;
    }
  }

  leer(clave: string): Promise<Readable> {
    return Promise.resolve(createReadStream(this.ruta(clave)));
  }

  /** Guarda lo que llega por PUT; escribe en un temporal y recién luego lo renombra. */
  async guardar(clave: string, cuerpo: Readable): Promise<void> {
    const destino = this.ruta(clave);
    await mkdir(dirname(destino), { recursive: true });
    const temporal = `${destino}.subiendo`;
    await pipeline(cuerpo, createWriteStream(temporal));
    await rename(temporal, destino);
  }

  /** Verifica la firma de un enlace; lanza 400 si no es válida o venció. */
  verificar(
    clave: string,
    metodo: 'PUT' | 'GET',
    params: Record<string, string | undefined>,
  ): void {
    const { vence, firma, ...extra } = params;
    const esperada = this.firmar(clave, metodo, vence ?? '', extra);
    const valida =
      !!firma &&
      firma.length === esperada.length &&
      timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
    if (!valida) throw new BadRequestException('El enlace no es válido');
    if (Number(vence) < Date.now()) {
      throw new BadRequestException('El enlace venció; pide uno nuevo');
    }
  }

  /** Ruta en disco; rechaza claves que intenten salir de la carpeta. */
  ruta(clave: string): string {
    const ruta = normalize(join(this.carpeta, clave));
    if (!ruta.startsWith(this.carpeta + sep)) {
      throw new BadRequestException('Clave de archivo no válida');
    }
    return ruta;
  }

  private enlace(
    clave: string,
    metodo: 'PUT' | 'GET',
    minutos: number,
    extra: Record<string, string>,
  ): string {
    const vence = String(Date.now() + minutos * 60_000);
    const url = new URL(`${this.baseUrl}/archivos/${clave}`);
    for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
    url.searchParams.set('vence', vence);
    url.searchParams.set('firma', this.firmar(clave, metodo, vence, extra));
    return url.toString();
  }

  private firmar(
    clave: string,
    metodo: string,
    vence: string,
    extra: Record<string, string | undefined>,
  ): string {
    const partes = Object.keys(extra)
      .sort()
      .map((k) => `${k}=${extra[k] ?? ''}`);
    return createHmac('sha256', this.secreto)
      .update([metodo, clave, vence, ...partes].join('\n'))
      .digest('base64url');
  }
}

function limpiarNombre(nombre: string): string {
  return nombre.replace(/["\\\r\n]/g, '');
}
