import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../core/decorators/current-user.decorator.js';
import type { UsuarioAutenticado } from '../../core/auth/types/usuario-autenticado.js';
import { Roles } from '../../core/decorators/roles.decorator.js';
import { Rol } from '../../shared/enums/rol.enum.js';
import { idSchema } from '../../shared/validation/id.schema.js';
import {
  type AgregarPagoFijoDto,
  agregarPagoFijoSchema,
  type ActualizarPrestamoDto,
  actualizarPrestamoSchema,
  type ActualizarTrabajadorDto,
  actualizarTrabajadorSchema,
  type AgregarFilaDto,
  agregarFilaSchema,
  type ConsultarMesDto,
  consultarMesSchema,
  type ConsultarSemanaDto,
  consultarSemanaSchema,
  type CrearPrestamoDto,
  crearPrestamoSchema,
  type CuotaSemanaDto,
  cuotaSemanaSchema,
  type CrearMovimientoDto,
  crearMovimientoSchema,
  type CrearTrabajadorDto,
  crearTrabajadorSchema,
  type EditarPagoFijoDto,
  editarPagoFijoSchema,
  type MovimientoFijoDto,
  movimientoFijoSchema,
  type EditarFilaDto,
  editarFilaSchema,
  type FiltrosPrestamosDto,
  filtrosPrestamosSchema,
  type FiltrosPersonalDto,
  filtrosPersonalSchema,
  type PagarFilaDto,
  pagarFilaSchema,
  type ResumenMesDto,
  resumenMesSchema,
  type SeguimientoDto,
  seguimientoSchema,
  type SubirVoucherDto,
  subirVoucherSchema,
} from './dto/rrhh.schema.js';
import { PersonalService } from './personal.service.js';
import { SueldosFijosService } from './sueldos-fijos.service.js';
import { PrestamosService } from './prestamos.service.js';
import { TareoExcelService } from './tareo-excel.service.js';
import { TareoService } from './tareo.service.js';

/** Recursos humanos: personal y tareo. Por ahora solo el administrador. */
@Roles(Rol.ADMIN)
@Controller('rrhh')
export class RrhhController {
  constructor(
    private readonly personal: PersonalService,
    private readonly tareo: TareoService,
    private readonly excel: TareoExcelService,
    private readonly prestamos: PrestamosService,
    private readonly fijos: SueldosFijosService,
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

  @Get('tareo/seguimiento')
  seguimiento(@Query({ schema: seguimientoSchema }) q: SeguimientoDto) {
    return this.tareo.seguimiento(q.desde, q.hasta);
  }

  /** El tareo del mes en Excel, con el formato de la hoja que usaba RYSCOM. */
  @Get('tareo/excel')
  async exportar(
    @Query({ schema: resumenMesSchema }) q: ResumenMesDto,
    @Res() res: Response,
  ) {
    const archivo = await this.excel.exportarMes(q.mes);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="tareo-${q.mes}.xlsx"`,
      'Content-Length': String(archivo.length),
    });
    res.end(archivo);
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

  @Post('tareo/filas/:id/voucher')
  pedirSubidaVoucher(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: subirVoucherSchema }) dto: SubirVoucherDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.tareo.pedirSubidaVoucher(id, dto, usuario.id);
  }

  @Post('tareo/filas/:id/voucher/:archivoId/confirmar')
  confirmarVoucher(
    @Param('id', { schema: idSchema }) id: string,
    @Param('archivoId', { schema: idSchema }) archivoId: string,
  ) {
    return this.tareo.confirmarVoucher(id, archivoId);
  }

  @Delete('tareo/filas/:id/voucher/:archivoId')
  quitarVoucher(
    @Param('id', { schema: idSchema }) id: string,
    @Param('archivoId', { schema: idSchema }) archivoId: string,
  ) {
    return this.tareo.quitarVoucher(id, archivoId);
  }

  @Delete('tareo/movimientos/:id')
  quitarMovimiento(@Param('id', { schema: idSchema }) id: string) {
    return this.tareo.quitarMovimiento(id);
  }

  /** Cambia la cuota de un préstamo en esa semana (0 la quita). */
  @Patch('tareo/filas/:id/prestamos/:prestamoId')
  fijarCuota(
    @Param('id', { schema: idSchema }) id: string,
    @Param('prestamoId', { schema: idSchema }) prestamoId: string,
    @Body({ schema: cuotaSemanaSchema }) dto: CuotaSemanaDto,
  ) {
    return this.tareo.fijarCuotaPrestamo(id, prestamoId, dto.monto);
  }

  // ---------- Préstamos ----------

  @Get('prestamos')
  listarPrestamos(
    @Query({ schema: filtrosPrestamosSchema }) filtros: FiltrosPrestamosDto,
  ) {
    return this.prestamos.listar(filtros);
  }

  @Get('prestamos/:id')
  detallePrestamo(@Param('id', { schema: idSchema }) id: string) {
    return this.prestamos.detalle(id);
  }

  @Post('prestamos')
  crearPrestamo(
    @Body({ schema: crearPrestamoSchema }) dto: CrearPrestamoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.prestamos.crear(dto, usuario.id);
  }

  @Patch('prestamos/:id')
  actualizarPrestamo(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: actualizarPrestamoSchema }) dto: ActualizarPrestamoDto,
  ) {
    return this.prestamos.actualizar(id, dto);
  }

  @Delete('prestamos/:id')
  eliminarPrestamo(@Param('id', { schema: idSchema }) id: string) {
    return this.prestamos.eliminar(id);
  }

  // ---------- Sueldos fijos ----------

  @Get('sueldos-fijos')
  sueldosDelMes(@Query({ schema: consultarMesSchema }) dto: ConsultarMesDto) {
    return this.fijos.mes(dto.mes);
  }

  @Post('sueldos-fijos')
  agregarPagoFijo(
    @Body({ schema: agregarPagoFijoSchema }) dto: AgregarPagoFijoDto,
  ) {
    return this.fijos.agregar(dto);
  }

  @Patch('sueldos-fijos/:id')
  editarPagoFijo(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: editarPagoFijoSchema }) dto: EditarPagoFijoDto,
  ) {
    return this.fijos.editar(id, dto);
  }

  @Patch('sueldos-fijos/:id/pago')
  pagarFijo(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: pagarFilaSchema }) dto: PagarFilaDto,
  ) {
    return this.fijos.pagar(id, dto);
  }

  @Delete('sueldos-fijos/:id')
  quitarPagoFijo(@Param('id', { schema: idSchema }) id: string) {
    return this.fijos.quitar(id);
  }

  @Post('sueldos-fijos/:id/movimientos')
  agregarMovimientoFijo(
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: movimientoFijoSchema }) dto: MovimientoFijoDto,
  ) {
    return this.fijos.agregarMovimiento(id, dto);
  }

  @Delete('sueldos-fijos/movimientos/:id')
  quitarMovimientoFijo(@Param('id', { schema: idSchema }) id: string) {
    return this.fijos.quitarMovimiento(id);
  }
}
