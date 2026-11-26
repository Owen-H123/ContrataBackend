import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../../core/decorators/current-user.decorator.js';
import type { UsuarioAutenticado } from '../../../core/auth/types/usuario-autenticado.js';
import { idSchema } from '../../../shared/validation/id.schema.js';
import {
  type AbonarDto,
  abonarSchema,
  type AprobarDto,
  aprobarSchema,
  beneficiariosSchema,
  type TrabajosParaElegirDto,
  trabajosParaElegirSchema,
  type CrearSolicitudDto,
  crearSolicitudSchema,
  type EditarSolicitudDto,
  editarSolicitudSchema,
  type FiltrosSolicitudDto,
  filtrosSolicitudSchema,
  type RechazarDto,
  rechazarSchema,
  type SubirArchivoDto,
  subirArchivoSchema,
} from './dto/solicitud.schema.js';
import { SolicitudesService } from './solicitudes.service.js';

/**
 * Solicitudes de dinero. Cualquier usuario con sesión entra, pero cada acción revisa
 * su permiso (pedir, aprobar o abonar) en el servicio.
 */
@Controller('solicitudes')
export class SolicitudesController {
  constructor(private readonly solicitudes: SolicitudesService) {}

  @Get()
  listar(
    @Query({ schema: filtrosSolicitudSchema }) filtros: FiltrosSolicitudDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.solicitudes.listar(filtros, usuario);
  }

  @Get('conteos')
  conteos(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.solicitudes.conteos(usuario);
  }

  @Get('beneficiarios')
  beneficiarios(@Query({ schema: beneficiariosSchema }) q: { q: string }) {
    return this.solicitudes.beneficiarios(q.q);
  }

  /** Trabajos abiertos para elegir a qué se carga la solicitud. */
  @Get('trabajos')
  trabajos(
    @Query({ schema: trabajosParaElegirSchema }) f: TrabajosParaElegirDto,
  ) {
    return this.solicitudes.trabajosParaElegir(f);
  }

  @Get(':id')
  obtener(
    @Param('id', { schema: idSchema }) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.solicitudes.obtener(id, usuario);
  }

  @Post()
  crear(
    @Body({ schema: crearSolicitudSchema }) dto: CrearSolicitudDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.solicitudes.crear(dto, usuario);
  }

  @Patch(':id')
  editar(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: editarSolicitudSchema }) dto: EditarSolicitudDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.solicitudes.editar(id, dto, usuario);
  }

  @Delete(':id')
  @HttpCode(204)
  anular(
    @Param('id', { schema: idSchema }) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.solicitudes.anular(id, usuario);
  }

  @Post(':id/aprobar')
  aprobar(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: aprobarSchema }) dto: AprobarDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.solicitudes.aprobar(id, dto, usuario);
  }

  @Post(':id/rechazar')
  rechazar(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: rechazarSchema }) dto: RechazarDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.solicitudes.rechazar(id, dto, usuario);
  }

  @Post(':id/abonar')
  abonar(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: abonarSchema }) dto: AbonarDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.solicitudes.abonar(id, dto, usuario);
  }

  @Post(':id/rendir')
  rendir(
    @Param('id', { schema: idSchema }) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.solicitudes.rendir(id, usuario);
  }

  @Post(':id/archivos')
  subir(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: subirArchivoSchema }) dto: SubirArchivoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.solicitudes.solicitarSubida(id, dto, usuario);
  }

  @Post(':id/archivos/:archivoId/confirmar')
  confirmar(
    @Param('id', { schema: idSchema }) id: string,
    @Param('archivoId', { schema: idSchema }) archivoId: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.solicitudes.confirmarArchivo(id, archivoId, usuario);
  }

  @Delete(':id/archivos/:archivoId')
  quitarArchivo(
    @Param('id', { schema: idSchema }) id: string,
    @Param('archivoId', { schema: idSchema }) archivoId: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.solicitudes.quitarArchivo(id, archivoId, usuario);
  }
}
