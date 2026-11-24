import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../core/decorators/public.decorator.js';
import { StorageService } from './storage.service.js';

/** Tipos de imagen que el navegador puede mostrar; cualquier otro se sirve como binario. */
const TIPOS = new Map(
  Object.entries({
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    pdf: 'application/pdf',
  }),
);

/**
 * Recibe y entrega archivos cuando el almacén es la carpeta local.
 * Las rutas son públicas porque la seguridad va en la firma del enlace,
 * exactamente como con los enlaces firmados de R2.
 */
@Public()
@Controller('archivos')
export class ArchivosLocalesController {
  constructor(private readonly storage: StorageService) {}

  @Put('*clave')
  async subir(
    @Param('clave') clave: string | string[],
    @Query() query: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const local = this.exigirLocal();
    const ruta = unir(clave);
    local.verificar(ruta, 'PUT', query);
    await local.guardar(ruta, req);
    res.status(200).end();
  }

  @Get('*clave')
  async descargar(
    @Param('clave') clave: string | string[],
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    const local = this.exigirLocal();
    const ruta = unir(clave);
    local.verificar(ruta, 'GET', query);
    const archivo = await local.consultar(ruta);
    if (!archivo) throw new NotFoundException('El archivo no existe');

    const extension = ruta.split('.').pop()?.toLowerCase() ?? '';
    res.setHeader(
      'Content-Type',
      TIPOS.get(extension) ?? 'application/octet-stream',
    );
    res.setHeader('Content-Length', archivo.bytes);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    // Las fotos se muestran desde el frontend, que vive en otro origen.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (query.nombre) {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${query.nombre}"; filename*=UTF-8''${encodeURIComponent(query.nombre)}`,
      );
    }
    (await local.leer(ruta)).pipe(res);
  }

  private exigirLocal() {
    const local = this.storage.local;
    if (!local) throw new NotFoundException();
    return local;
  }
}

/** Nest entrega el comodín como arreglo de segmentos o como texto, según la versión. */
function unir(clave: string | string[]): string {
  return Array.isArray(clave) ? clave.join('/') : clave;
}
