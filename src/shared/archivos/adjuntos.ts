import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { FindOptionsWhere, ObjectLiteral, Repository } from 'typeorm';
import { z } from 'zod';
import type { StorageService } from '../../services/storage/storage.service.js';

/**
 * Archivos adjuntos (vouchers, facturas, boletas): fotos o PDF de hasta 10 MB que el navegador
 * sube directo al almacenamiento. El flujo es siempre el mismo:
 *   1. pedir   → se crea el registro (sin confirmar) y se devuelve la URL firmada de subida.
 *   2. confirmar → se comprueba que el archivo llegó; recién ahí se muestra.
 *   3. quitar  → se borra el registro y el archivo.
 */

export const TIPOS_ADJUNTO = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
} as const;
export type TipoAdjunto = keyof typeof TIPOS_ADJUNTO;
export const MAX_BYTES_ADJUNTO = 10 * 1024 * 1024;

export const subirAdjuntoSchema = z.object({
  nombreArchivo: z.string().trim().min(1).max(200),
  tipoContenido: z.enum(
    Object.keys(TIPOS_ADJUNTO) as [TipoAdjunto, ...TipoAdjunto[]],
    'Solo fotos (JPG, PNG, WEBP, HEIC) o PDF',
  ),
  bytes: z.int().positive().max(MAX_BYTES_ADJUNTO, 'El archivo supera 10 MB'),
});
export type SubirAdjuntoDto = z.infer<typeof subirAdjuntoSchema>;

/** Columnas que comparten las tablas de adjuntos. */
export interface Adjunto extends ObjectLiteral {
  id: string;
  clave: string;
  nombreArchivo: string;
  tipoContenido: string;
  bytes: number | null;
  confirmado: boolean;
  subidoPorId: string | null;
  creadoEn: Date;
}

export async function pedirSubida<T extends Adjunto>(
  storage: StorageService,
  repo: Repository<T>,
  opciones: {
    /** Columna y valor del padre, p. ej. { pagoId: '…' }. */
    padre: Partial<T>;
    /** Carpeta en el almacenamiento, p. ej. «sueldos/2026-11/<id>». */
    carpeta: string;
    max: number;
    dto: SubirAdjuntoDto;
    usuarioId: string;
  },
) {
  const { padre, carpeta, max, dto, usuarioId } = opciones;
  const ya = await repo.countBy({
    ...padre,
    confirmado: true,
  } as FindOptionsWhere<T>);
  if (ya >= max)
    throw new ConflictException(
      `Ya hay ${max} archivos adjuntos; quita alguno para subir otro`,
    );
  const id = randomUUID();
  const clave = `${carpeta}/${id}.${TIPOS_ADJUNTO[dto.tipoContenido]}`;
  const url = await storage.urlParaSubir(clave, dto.tipoContenido);
  await repo.insert({
    ...padre,
    id,
    clave,
    nombreArchivo: dto.nombreArchivo,
    tipoContenido: dto.tipoContenido,
    subidoPorId: usuarioId,
  } as unknown as T);
  return {
    archivoId: id,
    subida: {
      url,
      metodo: 'PUT',
      headers: { 'Content-Type': dto.tipoContenido },
    },
  };
}

export async function confirmarSubida<T extends Adjunto>(
  storage: StorageService,
  repo: Repository<T>,
  donde: FindOptionsWhere<T>,
) {
  const a = await repo.findOneBy(donde);
  if (!a) throw new NotFoundException('El archivo no existe');
  if (a.confirmado) return a;
  const guardado = await storage.consultar(a.clave);
  if (!guardado)
    throw new ConflictException(
      'El archivo todavía no llegó; vuelve a subirlo',
    );
  if (guardado.bytes > MAX_BYTES_ADJUNTO)
    throw new BadRequestException('El archivo supera 10 MB');
  await repo.update(a.id, {
    confirmado: true,
    bytes: guardado.bytes,
  } as never);
  return a;
}

export async function quitarAdjunto<T extends Adjunto>(
  storage: StorageService,
  repo: Repository<T>,
  donde: FindOptionsWhere<T>,
) {
  const a = await repo.findOneBy(donde);
  if (!a) throw new NotFoundException('El archivo no existe');
  await repo.delete(a.id);
  try {
    await storage.borrar(a.clave);
  } catch {
    // Si el archivo no se pudo borrar del almacenamiento, igual deja de mostrarse.
  }
  return a;
}

/** Lo que ve el frontend de un adjunto, con su enlace de descarga firmado. */
export async function conEnlaces(
  storage: StorageService,
  lista: Pick<Adjunto, 'id' | 'clave' | 'nombreArchivo' | 'tipoContenido'>[],
) {
  return Promise.all(
    lista.map(async (a) => ({
      id: a.id,
      nombreArchivo: a.nombreArchivo,
      tipoContenido: a.tipoContenido,
      url: storage.configurado ? await storage.urlParaDescargar(a.clave) : null,
    })),
  );
}
