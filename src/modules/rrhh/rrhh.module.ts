import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PagoFijoMovimiento } from './entities/pago-fijo-movimiento.entity.js';
import { PagoFijo } from './entities/pago-fijo.entity.js';
import { Prestamo } from './entities/prestamo.entity.js';
import { TareoFila } from './entities/tareo-fila.entity.js';
import { TareoMovimiento } from './entities/tareo-movimiento.entity.js';
import { Trabajador } from './entities/trabajador.entity.js';
import { VoucherTareo } from './entities/voucher-tareo.entity.js';
import { VoucherPagoFijo } from './entities/voucher-pago-fijo.entity.js';
import { PersonalService } from './personal.service.js';
import { PrestamosService } from './prestamos.service.js';
import { SueldosFijosService } from './sueldos-fijos.service.js';
import { RrhhController } from './rrhh.controller.js';
import { TareoExcelService } from './tareo-excel.service.js';
import { TareoService } from './tareo.service.js';

/** Recursos humanos: ficha del personal y tareo semanal (asistencia, abonos, descuentos y pagos). */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Trabajador,
      TareoFila,
      TareoMovimiento,
      VoucherTareo,
      VoucherPagoFijo,
      Prestamo,
      PagoFijo,
      PagoFijoMovimiento,
    ]),
  ],
  controllers: [RrhhController],
  providers: [
    PersonalService,
    TareoService,
    TareoExcelService,
    PrestamosService,
    SueldosFijosService,
  ],
  exports: [PersonalService, TareoService],
})
export class RrhhModule {}
