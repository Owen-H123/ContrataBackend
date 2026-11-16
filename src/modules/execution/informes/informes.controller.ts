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
  Put,
  Query,
} from '@nestjs/common';
import type { UsuarioAutenticado } from '../../../core/auth/types/usuario-autenticado.js';
import { CurrentUser } from '../../../core/decorators/current-user.decorator.js';
import { Roles } from '../../../core/decorators/roles.decorator.js';
import { Rol } from '../../../shared/enums/rol.enum.js';
import { idSchema } from '../../../shared/validation/id.schema.js';
import {
  type AsignarTecnicosDto,
  asignarTecnicosSchema,
  type CrearInformeDto,
  crearInformeSchema,
  type FiltrosInformeDto,
  filtrosInformeSchema,
  type ReabrirInformeDto,
  reabrirInformeSchema,
  type AgregarActividadDto,
  agregarActividadSchema,
  type UbicacionDto,
  ubicacionSchema,
} from './dto/informe.schema.js';
import { InformesService } from './informes.service.js';

/**
 * Consultar: todos los roles (un TECNICO solo ve los informes que tiene asignados, sin precios).
 * Abrir informes y asignar técnicos: ADMIN. Registrar la ubicación: ADMIN o el técnico asignado.
 * Finalizar la ejecución: ADMIN o el técnico asignado. Reabrir y agregar ítems: ADMIN.
 */
@Controller('informes')
export class InformesController {
  constructor(private readonly informes: InformesService) {}

  @Get()
  listar(
    @Query({ schema: filtrosInformeSchema }) filtros: FiltrosInformeDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.informes.listar(filtros, usuario);
  }

  @Get(':id')
  obtener(
    @Param('id', { schema: idSchema }) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.informes.obtener(id, usuario);
  }

  @Roles(Rol.ADMIN)
  @Post()
  crear(
    @Body({ schema: crearInformeSchema }) dto: CrearInformeDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.informes.crear(dto, usuario);
  }

  @Roles(Rol.ADMIN)
  @Put(':id/tecnicos')
  asignarTecnicos(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: asignarTecnicosSchema }) dto: AsignarTecnicosDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.informes.asignarTecnicos(id, dto, usuario);
  }

  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Patch(':id/ubicacion')
  registrarUbicacion(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: ubicacionSchema }) dto: UbicacionDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.informes.registrarUbicacion(id, dto, usuario);
  }

  /** Da por terminada la ejecución. 409 con `detalles` si falta algo. */
  @Roles(Rol.ADMIN, Rol.TECNICO)
  @Post(':id/finalizar')
  @HttpCode(HttpStatus.OK)
  finalizar(
    @Param('id', { schema: idSchema }) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.informes.finalizar(id, usuario);
  }

  /** Vuelve a abrir la ejecución (para seguir cargando fotos o ítems). */
  @Roles(Rol.ADMIN)
  @Post(':id/reabrir')
  @HttpCode(HttpStatus.OK)
  reabrir(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: reabrirInformeSchema }) dto: ReabrirInformeDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.informes.reabrir(id, dto, usuario);
  }

  /** Elimina un informe creado por error. 409 si ya tiene fotos. */
  @Roles(Rol.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  eliminar(
    @Param('id', { schema: idSchema }) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.informes.eliminar(id, usuario);
  }

  /** Agrega un ítem en el sitio del informe; los técnicos lo ven al instante. */
  @Roles(Rol.ADMIN)
  @Post(':id/actividades')
  agregarActividad(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: agregarActividadSchema }) dto: AgregarActividadDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.informes.agregarActividad(id, dto, usuario);
  }
}
