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
import { ContabilidadService } from './contabilidad.service.js';
import {
  type ActualizarComprobanteDto,
  actualizarComprobanteSchema,
  type ContraparteDto,
  contraparteSchema,
  type CrearComprobanteDto,
  crearComprobanteSchema,
  type FiltrosComprobanteDto,
  filtrosComprobanteSchema,
  type PagoDto,
  pagoSchema,
} from './dto/contabilidad.schema.js';

/** Contabilidad: comprobantes de venta y de compra, con sus cobros y pagos. */
@Roles(Rol.ADMIN)
@Controller('contabilidad')
export class ContabilidadController {
  constructor(private readonly contabilidad: ContabilidadService) {}

  @Get('comprobantes')
  listar(
    @Query({ schema: filtrosComprobanteSchema }) filtros: FiltrosComprobanteDto,
  ) {
    return this.contabilidad.listar(filtros);
  }

  @Get('contrapartes')
  contrapartes(@Query({ schema: contraparteSchema }) dto: ContraparteDto) {
    return this.contabilidad.contrapartes(dto.q);
  }

  @Get('comprobantes/:id')
  obtener(@Param('id', { schema: idSchema }) id: string) {
    return this.contabilidad.obtener(id);
  }

  @Post('comprobantes')
  crear(
    @Body({ schema: crearComprobanteSchema }) dto: CrearComprobanteDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.contabilidad.crear(dto, usuario);
  }

  @Patch('comprobantes/:id')
  actualizar(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: actualizarComprobanteSchema })
    dto: ActualizarComprobanteDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.contabilidad.actualizar(id, dto, usuario);
  }

  @Delete('comprobantes/:id')
  eliminar(
    @Param('id', { schema: idSchema }) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.contabilidad.eliminar(id, usuario);
  }

  @Post('comprobantes/:id/pagos')
  agregarPago(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: pagoSchema }) dto: PagoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.contabilidad.agregarPago(id, dto, usuario);
  }

  @Delete('pagos/:id')
  quitarPago(
    @Param('id', { schema: idSchema }) id: string,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.contabilidad.quitarPago(id, usuario);
  }
}
