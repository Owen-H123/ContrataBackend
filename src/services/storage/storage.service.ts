import {
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../core/config/env.schema.js';

/** Minutos que dura un enlace para subir una foto. */
const MINUTOS_SUBIDA = 15;
/** Minutos que dura un enlace para ver o descargar una foto. */
const MINUTOS_DESCARGA = 60;

export interface ArchivoGuardado {
  bytes: number;
  tipoContenido: string | undefined;
}

/**
 * Fotos en Cloudflare R2 (compatible con S3).
 *
 * El celular sube y descarga directo de R2 con enlaces firmados de corta duración:
 * la foto no pasa por la API, y el bucket sigue privado.
 * Las fotos no se borran desde aquí: se conservan aunque se oculten en la app.
 */
@Injectable()
export class StorageService {
  private readonly cliente: S3Client | null;
  private readonly bucket: string | undefined;

  constructor(config: ConfigService<Env, true>) {
    const cuenta = config.get('R2_ACCOUNT_ID', { infer: true });
    const accessKeyId = config.get('R2_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('R2_SECRET_ACCESS_KEY', { infer: true });
    this.bucket = config.get('R2_BUCKET', { infer: true });

    this.cliente =
      cuenta && accessKeyId && secretAccessKey && this.bucket
        ? new S3Client({
            region: 'auto',
            endpoint: `https://${cuenta}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId, secretAccessKey },
          })
        : null;
  }

  /** true cuando las cuatro variables R2_* están definidas. */
  get configurado(): boolean {
    return this.cliente !== null;
  }

  /**
   * Enlace para que el navegador suba un archivo con `PUT`.
   * El navegador debe enviar el mismo `Content-Type` que se firmó.
   */
  async urlParaSubir(clave: string, tipoContenido: string): Promise<string> {
    return getSignedUrl(
      this.s3(),
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: clave,
        ContentType: tipoContenido,
      }),
      { expiresIn: MINUTOS_SUBIDA * 60 },
    );
  }

  /**
   * Enlace para ver un archivo. Con `nombreDescarga`, el navegador lo descarga
   * con ese nombre en vez de mostrarlo.
   */
  async urlParaDescargar(
    clave: string,
    nombreDescarga?: string,
  ): Promise<string> {
    return getSignedUrl(
      this.s3(),
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: clave,
        ResponseContentDisposition: nombreDescarga
          ? `attachment; filename="${nombreDescarga.replace(/["\\\r\n]/g, '')}"`
          : undefined,
      }),
      { expiresIn: MINUTOS_DESCARGA * 60 },
    );
  }

  /** Confirma que el archivo llegó a R2; null si no existe. */
  async consultar(clave: string): Promise<ArchivoGuardado | null> {
    try {
      const res = await this.s3().send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: clave }),
      );
      return { bytes: res.ContentLength ?? 0, tipoContenido: res.ContentType };
    } catch (error) {
      if (error instanceof NotFound) return null;
      throw error;
    }
  }

  private s3(): S3Client {
    if (!this.cliente) {
      throw new ServiceUnavailableException(
        'El almacenamiento de fotos no está configurado',
      );
    }
    return this.cliente;
  }
}
