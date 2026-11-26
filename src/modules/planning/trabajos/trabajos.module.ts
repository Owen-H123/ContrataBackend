import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventoTrabajo } from './entities/evento-trabajo.entity.js';
import { RevisionPresupuesto } from './entities/revision-presupuesto.entity.js';
import { Trabajo } from './entities/trabajo.entity.js';
import { TrabajosController } from './trabajos.controller.js';
import { TrabajosService } from './trabajos.service.js';

/** Seguimiento de cada trabajo: presupuesto → OC → ejecución → acta → factura → cobro. */
@Module({
  imports: [
    TypeOrmModule.forFeature([Trabajo, RevisionPresupuesto, EventoTrabajo]),
  ],
  controllers: [TrabajosController],
  providers: [TrabajosService],
  exports: [TrabajosService],
})
export class TrabajosModule {}
