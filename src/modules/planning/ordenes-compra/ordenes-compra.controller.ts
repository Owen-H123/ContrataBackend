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
import { Roles } from '../../../core/decorators/roles.decorator.js';
import { Rol } from '../../../shared/enums/rol.enum.js';
import { idSchema } from '../../../shared/validation/id.schema.js';
import {
  type ActualizarItemDto,
  actualizarItemSchema,
  type ActualizarOrdenDto,
  actualizarOrdenSchema,
  type CrearItemDto,
  crearItemSchema,
  type CrearOrdenDto,
  crearOrdenSchema,
  type FiltrosOrdenDto,
  filtrosOrdenSchema,
} from './dto/orden-compra.schema.js';
import { OrdenesCompraService } from './ordenes-compra.service.js';

/**
 * Consultar, crear y editar (también sus ítems): ADMIN y SUPERVISOR (las órdenes muestran
 * precios). Los técnicos verán sus actividades desde los informes.
 */
@Roles(Rol.ADMIN, Rol.SUPERVISOR)
@Controller('ordenes-compra')
export class OrdenesCompraController {
  constructor(private readonly ordenes: OrdenesCompraService) {}

  @Get()
  listar(@Query({ schema: filtrosOrdenSchema }) filtros: FiltrosOrdenDto) {
    return this.ordenes.listar(filtros);
  }

  @Get(':id')
  obtener(@Param('id', { schema: idSchema }) id: string) {
    return this.ordenes.obtener(id);
  }

  @Roles(Rol.ADMIN, Rol.SUPERVISOR)
  @Post()
  crear(@Body({ schema: crearOrdenSchema }) dto: CrearOrdenDto) {
    return this.ordenes.crear(dto);
  }

  @Roles(Rol.ADMIN, Rol.SUPERVISOR)
  @Patch(':id')
  actualizar(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: actualizarOrdenSchema }) dto: ActualizarOrdenDto,
  ) {
    return this.ordenes.actualizar(id, dto);
  }

  @Roles(Rol.ADMIN, Rol.SUPERVISOR)
  @Post(':id/items')
  agregarItem(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: crearItemSchema }) dto: CrearItemDto,
  ) {
    return this.ordenes.agregarItem(id, dto);
  }

  @Roles(Rol.ADMIN, Rol.SUPERVISOR)
  @Patch(':id/items/:itemId')
  actualizarItem(
    @Param('id', { schema: idSchema }) id: string,
    @Param('itemId', { schema: idSchema }) itemId: string,
    @Body({ schema: actualizarItemSchema }) dto: ActualizarItemDto,
  ) {
    return this.ordenes.actualizarItem(id, itemId, dto);
  }

  @Roles(Rol.ADMIN, Rol.SUPERVISOR)
  @Delete(':id/items/:itemId')
  eliminarItem(
    @Param('id', { schema: idSchema }) id: string,
    @Param('itemId', { schema: idSchema }) itemId: string,
  ) {
    return this.ordenes.eliminarItem(id, itemId);
  }
}
