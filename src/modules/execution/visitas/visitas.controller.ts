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
} from '@nestjs/common';
import type { UsuarioAutenticado } from '../../../core/auth/types/usuario-autenticado.js';
import { CurrentUser } from '../../../core/decorators/current-user.decorator.js';
import { Roles } from '../../../core/decorators/roles.decorator.js';
import { Rol } from '../../../shared/enums/rol.enum.js';
import { idSchema } from '../../../shared/validation/id.schema.js';
import {
  type ComentarVisitaDto,
  comentarVisitaSchema,
  type CrearVisitaDto,
  crearVisitaSchema,
  type EditarFotoVisitaDto,
  editarFotoVisitaSchema,
  type EditarVisitaDto,
  editarVisitaSchema,
  type FiltrosVisitaDto,
  filtrosVisitaSchema,
  type ReabrirVisitaDto,
  reabrirVisitaSchema,
  type SubirFotoVisitaDto,
  subirFotoVisitaSchema,
  type UbicacionDto,
  ubicacionSchema,
} from './dto/visita.schema.js';
import { VisitasService } from './visitas.service.js';

/**
 * Visitas técnicas.
 * - Consultar: todos (un TECNICO solo las suyas, sin montos).
 * - Registrar, editar, ubicación, fotos, comentar y finalizar: el TECNICO de la visita o ADMIN.
 * - Reabrir y eliminar: ADMIN. SUPERVISOR solo consulta.
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

  /** Órdenes abiertas con sus sitios, para el formulario de nueva visita. */
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

  /** 409 con `detalles` si falta la ubicación o las fotos. */
  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Post(':id/finalizar')
  @HttpCode(HttpStatus.OK)
  finalizar(
    @Param('id', { schema: idSchema }) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.visitas.finalizar(id, usuario);
  }

  @Roles(Rol.ADMIN)
  @Post(':id/reabrir')
  @HttpCode(HttpStatus.OK)
  reabrir(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: reabrirVisitaSchema }) dto: ReabrirVisitaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.visitas.reabrir(id, dto, usuario);
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
