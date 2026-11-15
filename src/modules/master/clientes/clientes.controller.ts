import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../../../core/decorators/roles.decorator.js';
import { Rol } from '../../../shared/enums/rol.enum.js';
import { idSchema } from '../../../shared/validation/id.schema.js';
import { ClientesService } from './clientes.service.js';
import {
  type ActualizarClienteDto,
  actualizarClienteSchema,
  type CrearClienteDto,
  crearClienteSchema,
} from './dto/cliente.schema.js';

/** Consultar: cualquier usuario con sesión. Crear y editar: solo ADMIN. */
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  listar() {
    return this.clientes.listar();
  }

  @Get(':id')
  obtener(@Param('id', { schema: idSchema }) id: string) {
    return this.clientes.obtener(id);
  }

  @Roles(Rol.ADMIN)
  @Post()
  crear(@Body({ schema: crearClienteSchema }) dto: CrearClienteDto) {
    return this.clientes.crear(dto);
  }

  @Roles(Rol.ADMIN)
  @Patch(':id')
  actualizar(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: actualizarClienteSchema }) dto: ActualizarClienteDto,
  ) {
    return this.clientes.actualizar(id, dto);
  }
}
