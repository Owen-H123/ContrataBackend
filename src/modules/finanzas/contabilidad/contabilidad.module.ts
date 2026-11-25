import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContabilidadController } from './contabilidad.controller.js';
import { ContabilidadService } from './contabilidad.service.js';
import { Comprobante } from './entities/comprobante.entity.js';
import { PagoComprobante } from './entities/pago-comprobante.entity.js';

/** Facturas y boletas de venta y de compra, sus cobros y pagos. */
@Module({
  imports: [TypeOrmModule.forFeature([Comprobante, PagoComprobante])],
  controllers: [ContabilidadController],
  providers: [ContabilidadService],
  exports: [ContabilidadService],
})
export class ContabilidadModule {}
