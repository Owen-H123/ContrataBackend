import {
  Body,
  Controller,
  Delete,
  Get,
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
  type ActualizarTrabajoDto,
  actualizarTrabajoSchema,
  type ComentarioDto,
  comentarioSchema,
  type CrearTrabajoDto,
  crearTrabajoSchema,
  type FiltrosTrabajoDto,
  filtrosTrabajoSchema,
  type RevisionDto,
  revisionSchema,
} from './dto/trabajo.schema.js';
import { TrabajosService } from './trabajos.service.js';

/** Seguimiento de trabajos (antes, el Excel «Control SDP»). Por ahora, el administrador. */
@Roles(Rol.ADMIN)
@Controller('trabajos')
export class TrabajosController {
  constructor(private readonly trabajos: TrabajosService) {}

  @Get()
  listar(@Query({ schema: filtrosTrabajoSchema }) filtros: FiltrosTrabajoDto) {
    return this.trabajos.listar(filtros);
  }

  @Get(':id')
  obtener(@Param('id', { schema: idSchema }) id: string) {
    return this.trabajos.obtener(id);
  }

  @Post()
  crear(
    @Body({ schema: crearTrabajoSchema }) dto: CrearTrabajoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.trabajos.crear(dto, usuario);
  }

  @Patch(':id')
  actualizar(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: actualizarTrabajoSchema }) dto: ActualizarTrabajoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.trabajos.actualizar(id, dto, usuario);
  }

  @Delete(':id')
  eliminar(@Param('id', { schema: idSchema }) id: string) {
    return this.trabajos.eliminar(id);
  }

  @Post(':id/revisiones')
  agregarRevision(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: revisionSchema }) dto: RevisionDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.trabajos.agregarRevision(id, dto, usuario);
  }

  @Delete(':id/revisiones/:revisionId')
  quitarRevision(
    @Param('id', { schema: idSchema }) id: string,
    @Param('revisionId', { schema: idSchema }) revisionId: string,
  ) {
    return this.trabajos.quitarRevision(id, revisionId);
  }

  @Post(':id/comentarios')
  comentar(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: comentarioSchema }) dto: ComentarioDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.trabajos.comentar(id, dto, usuario);
  }
}
