import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificacionesModule } from '../../core/notificaciones/notificaciones.module.js';
import { OrdenCompra } from '../../planning/ordenes-compra/entities/orden-compra.entity.js';
import { ComentarioVisita } from './entities/comentario-visita.entity.js';
import { FotoVisita } from './entities/foto-visita.entity.js';
import { VisitaTecnica } from './entities/visita-tecnica.entity.js';
import { VisitasController } from './visitas.controller.js';
import { VisitasService } from './visitas.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VisitaTecnica,
      FotoVisita,
      ComentarioVisita,
      OrdenCompra,
    ]),
    NotificacionesModule,
  ],
  controllers: [VisitasController],
  providers: [VisitasService],
})
export class VisitasModule {}
