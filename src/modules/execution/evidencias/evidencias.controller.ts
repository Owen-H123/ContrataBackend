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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { UsuarioAutenticado } from '../../../core/auth/types/usuario-autenticado.js';
import { CurrentUser } from '../../../core/decorators/current-user.decorator.js';
import { Roles } from '../../../core/decorators/roles.decorator.js';
import { Rol } from '../../../shared/enums/rol.enum.js';
import { idSchema } from '../../../shared/validation/id.schema.js';
import {
  type EditarEvidenciaDto,
  editarEvidenciaSchema,
  type SolicitarSubidaDto,
  solicitarSubidaSchema,
} from './dto/evidencia.schema.js';
import { EvidenciasService } from './evidencias.service.js';

/**
 * Fotos de un informe. Cargar, confirmar, comentar y quitar: el técnico asignado
 * (solo sus propias fotos) o ADMIN, mientras la ejecución esté abierta.
 * Descartar y restaurar al revisar: ADMIN, también con la ejecución finalizada.
 * Descargar: cualquiera que pueda ver el informe.
 */
@Controller('informes/:id')
export class EvidenciasController {
  constructor(private readonly evidencias: EvidenciasService) {}

  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Post('evidencias')
  solicitarSubida(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: solicitarSubidaSchema }) dto: SolicitarSubidaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.evidencias.solicitarSubida(id, dto, usuario);
  }

  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Post('evidencias/:evidenciaId/confirmar')
  @HttpCode(HttpStatus.OK)
  confirmar(
    @Param('id', { schema: idSchema }) id: string,
    @Param('evidenciaId', { schema: idSchema }) evidenciaId: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.evidencias.confirmar(id, evidenciaId, usuario);
  }

  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Patch('evidencias/:evidenciaId')
  editar(
    @Param('id', { schema: idSchema }) id: string,
    @Param('evidenciaId', { schema: idSchema }) evidenciaId: string,
    @Body({ schema: editarEvidenciaSchema }) dto: EditarEvidenciaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.evidencias.editar(id, evidenciaId, dto, usuario);
  }

  /** Quita la foto del informe; el archivo se conserva. */
  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Delete('evidencias/:evidenciaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  ocultar(
    @Param('id', { schema: idSchema }) id: string,
    @Param('evidenciaId', { schema: idSchema }) evidenciaId: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.evidencias.ocultar(id, evidenciaId, usuario);
  }

  /** Devuelve al informe una foto descartada (solo ADMIN). */
  @Roles(Rol.ADMIN)
  @Post('evidencias/:evidenciaId/restaurar')
  @HttpCode(HttpStatus.OK)
  restaurar(
    @Param('id', { schema: idSchema }) id: string,
    @Param('evidenciaId', { schema: idSchema }) evidenciaId: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.evidencias.restaurar(id, evidenciaId, usuario);
  }

  @Get('evidencias/:evidenciaId/descarga')
  enlaceDescarga(
    @Param('id', { schema: idSchema }) id: string,
    @Param('evidenciaId', { schema: idSchema }) evidenciaId: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.evidencias.enlaceDescarga(id, evidenciaId, usuario);
  }

  /** Todas las fotos del informe en un ZIP, ordenadas por carpetas. */
  @Get('fotos.zip')
  async descargarZip(
    @Param('id', { schema: idSchema }) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
    @Res() res: Response,
  ) {
    await this.evidencias.descargarZip(id, usuario, res);
  }
}
