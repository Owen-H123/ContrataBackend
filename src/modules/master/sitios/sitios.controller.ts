import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../../../core/decorators/roles.decorator.js';
import { Rol } from '../../../shared/enums/rol.enum.js';
import { idSchema } from '../../../shared/validation/id.schema.js';
import {
  type ActualizarSitioDto,
  actualizarSitioSchema,
  type CrearSitioDto,
  crearSitioSchema,
  type FiltrosSitioDto,
  filtrosSitioSchema,
} from './dto/sitio.schema.js';
import { SitiosService } from './sitios.service.js';

/** Consultar: cualquier usuario con sesión. Crear y editar: solo ADMIN. */
@Controller('sitios')
export class SitiosController {
  constructor(private readonly sitios: SitiosService) {}

  @Get()
  listar(@Query({ schema: filtrosSitioSchema }) filtros: FiltrosSitioDto) {
    return this.sitios.listar(filtros);
  }

  @Get(':id')
  obtener(@Param('id', { schema: idSchema }) id: string) {
    return this.sitios.obtener(id);
  }

  // El supervisor también registra sitios (pedido de RYSCOM); borrar sigue siendo del admin.
  @Roles(Rol.ADMIN, Rol.SUPERVISOR)
  @Post()
  crear(@Body({ schema: crearSitioSchema }) dto: CrearSitioDto) {
    return this.sitios.crear(dto);
  }

  @Roles(Rol.ADMIN, Rol.SUPERVISOR)
  @Patch(':id')
  actualizar(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: actualizarSitioSchema }) dto: ActualizarSitioDto,
  ) {
    return this.sitios.actualizar(id, dto);
  }
}
