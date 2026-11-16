import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import type { UsuarioAutenticado } from '../../../core/auth/types/usuario-autenticado.js';
import { CurrentUser } from '../../../core/decorators/current-user.decorator.js';
import { idSchema } from '../../../shared/validation/id.schema.js';
import { NotificacionesService } from './notificaciones.service.js';

/** Los avisos del usuario que hace la petición; cualquier rol con sesión. */
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  @Get()
  listar(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.notificaciones.listar(usuario);
  }

  @Get('sin-leer')
  contarSinLeer(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.notificaciones.contarSinLeer(usuario);
  }

  @Post('leer-todas')
  @HttpCode(HttpStatus.NO_CONTENT)
  leerTodas(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.notificaciones.marcarTodasLeidas(usuario);
  }

  @Post(':id/leer')
  @HttpCode(HttpStatus.NO_CONTENT)
  leer(
    @Param('id', { schema: idSchema }) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.notificaciones.marcarLeida(id, usuario);
  }
}
