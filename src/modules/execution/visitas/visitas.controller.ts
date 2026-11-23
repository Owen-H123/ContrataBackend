import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { UsuarioAutenticado } from '../../../core/auth/types/usuario-autenticado.js';
import { CurrentUser } from '../../../core/decorators/current-user.decorator.js';
import { Roles } from '../../../core/decorators/roles.decorator.js';
import { Rol } from '../../../shared/enums/rol.enum.js';
import { idSchema } from '../../../shared/validation/id.schema.js';
import {
  type CambiarEstadoVisitaDto,
  cambiarEstadoVisitaSchema,
  type ComentarVisitaDto,
  comentarVisitaSchema,
  type CrearHallazgoDto,
  crearHallazgoSchema,
  type CrearVisitaDto,
  crearVisitaSchema,
  type EditarFotoVisitaDto,
  editarFotoVisitaSchema,
  type EditarHallazgoDto,
  editarHallazgoSchema,
  type EditarVisitaDto,
  editarVisitaSchema,
  type FiltrosVisitaDto,
  filtrosVisitaSchema,
  type SubirFotoVisitaDto,
  subirFotoVisitaSchema,
  type UbicacionDto,
  ubicacionSchema,
} from './dto/visita.schema.js';
import { VisitasService } from './visitas.service.js';

/**
 * Visitas técnicas (inspección previa, sin orden de compra).
 * - Consultar y descargar el ZIP: todos (un TECNICO solo las suyas).
 * - Registrar, editar, estado, ubicación, hallazgos, fotos y comentarios: el TECNICO de la
 *   visita o ADMIN. Eliminar: ADMIN. SUPERVISOR solo consulta.
 */
@Controller('visitas')
export class VisitasController {
  constructor(private readonly visitas: VisitasService) {}

  @Get()
  listar(
    @Query({ schema: filtrosVisitaSchema }) filtros: FiltrosVisitaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.visitas.listar(filtros, usuario);
  }

  /** Sitios existentes y clientes, para el formulario de nueva visita. */
  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Get('opciones')
  opciones() {
    return this.visitas.opciones();
  }

  @Get(':id')
  obtener(
    @Param('id', { schema: idSchema }) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.visitas.obtener(id, usuario);
  }

  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Post()
  crear(
    @Body({ schema: crearVisitaSchema }) dto: CrearVisitaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.visitas.crear(dto, usuario);
  }

  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Patch(':id')
  editar(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: editarVisitaSchema }) dto: EditarVisitaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.visitas.editar(id, dto, usuario);
  }

  /** Pendiente de visitar, visitado o acceso rechazado. */
  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Patch(':id/estado')
  cambiarEstado(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: cambiarEstadoVisitaSchema }) dto: CambiarEstadoVisitaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.visitas.cambiarEstado(id, dto, usuario);
  }

  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Patch(':id/ubicacion')
  registrarUbicacion(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: ubicacionSchema }) dto: UbicacionDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.visitas.registrarUbicacion(id, dto, usuario);
  }

  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Post(':id/hallazgos')
  crearHallazgo(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: crearHallazgoSchema }) dto: CrearHallazgoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.visitas.crearHallazgo(id, dto, usuario);
  }

  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Patch(':id/hallazgos/:hallazgoId')
  editarHallazgo(
    @Param('id', { schema: idSchema }) id: string,
    @Param('hallazgoId', { schema: idSchema }) hallazgoId: string,
    @Body({ schema: editarHallazgoSchema }) dto: EditarHallazgoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.visitas.editarHallazgo(id, hallazgoId, dto, usuario);
  }

  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Delete(':id/hallazgos/:hallazgoId')
  eliminarHallazgo(
    @Param('id', { schema: idSchema }) id: string,
    @Param('hallazgoId', { schema: idSchema }) hallazgoId: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.visitas.eliminarHallazgo(id, hallazgoId, usuario);
  }

  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Post(':id/fotos')
  solicitarSubida(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: subirFotoVisitaSchema }) dto: SubirFotoVisitaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.visitas.solicitarSubida(id, dto, usuario);
  }

  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Post(':id/fotos/:fotoId/confirmar')
  @HttpCode(HttpStatus.OK)
  confirmarFoto(
    @Param('id', { schema: idSchema }) id: string,
    @Param('fotoId', { schema: idSchema }) fotoId: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.visitas.confirmarFoto(id, fotoId, usuario);
  }

  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Patch(':id/fotos/:fotoId')
  editarFoto(
    @Param('id', { schema: idSchema }) id: string,
    @Param('fotoId', { schema: idSchema }) fotoId: string,
    @Body({ schema: editarFotoVisitaSchema }) dto: EditarFotoVisitaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.visitas.editarFoto(id, fotoId, dto, usuario);
  }

  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Delete(':id/fotos/:fotoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  quitarFoto(
    @Param('id', { schema: idSchema }) id: string,
    @Param('fotoId', { schema: idSchema }) fotoId: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.visitas.quitarFoto(id, fotoId, usuario);
  }

  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Post(':id/comentarios')
  comentar(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: comentarVisitaSchema }) dto: ComentarVisitaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.visitas.comentar(id, dto, usuario);
  }

  /** Todas las fotos en un ZIP, en carpetas: EPP, Fachada, Croquis y cada hallazgo. */
  @Get(':id/fotos.zip')
  async descargarZip(
    @Param('id', { schema: idSchema }) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
    @Res() res: Response,
  ) {
    await this.visitas.descargarZip(id, usuario, res);
  }

  @Roles(Rol.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  eliminar(
    @Param('id', { schema: idSchema }) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.visitas.eliminar(id, usuario);
  }
}
