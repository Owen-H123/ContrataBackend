import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TareoFila } from './entities/tareo-fila.entity.js';
import { TareoMovimiento } from './entities/tareo-movimiento.entity.js';
import { Trabajador } from './entities/trabajador.entity.js';
import { PersonalService } from './personal.service.js';
import { RrhhController } from './rrhh.controller.js';
import { TareoExcelService } from './tareo-excel.service.js';
import { TareoService } from './tareo.service.js';

/** Recursos humanos: ficha del personal y tareo semanal (asistencia, abonos, descuentos y pagos). */
@Module({
  imports: [TypeOrmModule.forFeature([Trabajador, TareoFila, TareoMovimiento])],
  controllers: [RrhhController],
  providers: [PersonalService, TareoService, TareoExcelService],
  exports: [PersonalService, TareoService],
})
export class RrhhModule {}
