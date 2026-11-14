import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Rol } from '../../common/enums/rol.enum.js';
import {
  type ActualizarUsuarioDto,
  actualizarUsuarioSchema,
  type CrearUsuarioDto,
  crearUsuarioSchema,
  idSchema,
} from './dto/usuario.schema.js';
import { UsuariosService } from './usuarios.service.js';

@Roles(Rol.ADMIN)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  listar() {
    return this.usuarios.listar();
  }

  @Post()
  crear(@Body({ schema: crearUsuarioSchema }) dto: CrearUsuarioDto) {
    return this.usuarios.crear(dto);
  }

  @Patch(':id')
  actualizar(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: actualizarUsuarioSchema }) dto: ActualizarUsuarioDto,
  ) {
    return this.usuarios.actualizar(id, dto);
  }
}
