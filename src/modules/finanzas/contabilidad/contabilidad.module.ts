import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContabilidadController } from './contabilidad.controller.js';
import { ContabilidadService } from './contabilidad.service.js';
import { Comprobante } from './entities/comprobante.entity.js';
import { PagoComprobante } from './entities/pago-comprobante.entity.js';
import { ReportesService } from './reportes.service.js';
import { Trabajo } from '../../planning/trabajos/entities/trabajo.entity.js';
import { PagoFijo } from '../../rrhh/entities/pago-fijo.entity.js';
import { TareoFila } from '../../rrhh/entities/tareo-fila.entity.js';
import { SolicitudDinero } from '../solicitudes/entities/solicitud-dinero.entity.js';

/** Facturas y boletas de venta y de compra, sus cobros y pagos. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Comprobante,
      PagoComprobante,
      // Para «todos los pagos» y el panel: se leen, no se modifican.
      TareoFila,
      PagoFijo,
      SolicitudDinero,
      Trabajo,
    ]),
  ],
  controllers: [ContabilidadController],
  providers: [ContabilidadService, ReportesService],
  exports: [ContabilidadService],
})
export class ContabilidadModule {}
