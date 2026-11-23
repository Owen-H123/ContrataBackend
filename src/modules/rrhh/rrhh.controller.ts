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
import { Roles } from '../../core/decorators/roles.decorator.js';
import { Rol } from '../../shared/enums/rol.enum.js';
import { idSchema } from '../../shared/validation/id.schema.js';
import {
  type ActualizarTrabajadorDto,
  actualizarTrabajadorSchema,
  type AgregarFilaDto,
  agregarFilaSchema,
  type ConsultarSemanaDto,
  consultarSemanaSchema,
  type CrearMovimientoDto,
  crearMovimientoSchema,
  type CrearTrabajadorDto,
  crearTrabajadorSchema,
  type EditarFilaDto,
  editarFilaSchema,
  type FiltrosPersonalDto,
  filtrosPersonalSchema,
  type PagarFilaDto,
  pagarFilaSchema,
  type ResumenMesDto,
  resumenMesSchema,
} from './dto/rrhh.schema.js';
import { PersonalService } from './personal.service.js';
import { TareoService } from './tareo.service.js';

/** Recursos humanos: personal y tareo. Por ahora solo el administrador. */
@Roles(Rol.ADMIN)
@Controller('rrhh')
export class RrhhController {
  constructor(
    private readonly personal: PersonalService,
    private readonly tareo: TareoService,
  ) {}

  // ---------- Personal ----------

  @Get('personal')
  listarPersonal(
    @Query({ schema: filtrosPersonalSchema }) filtros: FiltrosPersonalDto,
  ) {
    return this.personal.listar(filtros);
  }

  @Post('personal')
  crearTrabajador(
    @Body({ schema: crearTrabajadorSchema }) dto: CrearTrabajadorDto,
  ) {
    return this.personal.crear(dto);
  }

  @Patch('personal/:id')
  actualizarTrabajador(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: actualizarTrabajadorSchema }) dto: ActualizarTrabajadorDto,
  ) {
    return this.personal.actualizar(id, dto);
  }

  // ---------- Tareo ----------

  @Get('tareo')
  semana(@Query({ schema: consultarSemanaSchema }) q: ConsultarSemanaDto) {
    return this.tareo.semana(q.semana);
  }

  @Get('tareo/resumen')
  resumen(@Query({ schema: resumenMesSchema }) q: ResumenMesDto) {
    return this.tareo.resumenMes(q.mes);
  }

  @Post('tareo/filas')
  agregar(@Body({ schema: agregarFilaSchema }) dto: AgregarFilaDto) {
    return this.tareo.agregar(dto);
  }

  @Post('tareo/copiar-anterior')
  copiarAnterior(
    @Body({ schema: consultarSemanaSchema }) dto: ConsultarSemanaDto,
  ) {
    return this.tareo.copiarAnterior(dto.semana);
  }

  @Patch('tareo/filas/:id')
  editar(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: editarFilaSchema }) dto: EditarFilaDto,
  ) {
    return this.tareo.editar(id, dto);
  }

  @Patch('tareo/filas/:id/pago')
  pagar(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: pagarFilaSchema }) dto: PagarFilaDto,
  ) {
    return this.tareo.pagar(id, dto);
  }

  @Delete('tareo/filas/:id')
  quitar(@Param('id', { schema: idSchema }) id: string) {
    return this.tareo.quitar(id);
  }

  @Post('tareo/filas/:id/movimientos')
  agregarMovimiento(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: crearMovimientoSchema }) dto: CrearMovimientoDto,
  ) {
    return this.tareo.agregarMovimiento(id, dto);
  }

  @Delete('tareo/movimientos/:id')
  quitarMovimiento(@Param('id', { schema: idSchema }) id: string) {
    return this.tareo.quitarMovimiento(id);
  }
}
