import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificacionesModule } from '../../core/notificaciones/notificaciones.module.js';
import { Usuario } from '../../core/usuarios/entities/usuario.entity.js';
import { Sitio } from '../../master/sitios/entities/sitio.entity.js';
import { Trabajador } from '../../rrhh/entities/trabajador.entity.js';
import { ArchivoSolicitud } from './entities/archivo-solicitud.entity.js';
import { SolicitudDinero } from './entities/solicitud-dinero.entity.js';
import { SolicitudesController } from './solicitudes.controller.js';
import { SolicitudesService } from './solicitudes.service.js';

/** Solicitudes de dinero: pedir, aprobar, abonar y rendir. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SolicitudDinero,
      ArchivoSolicitud,
      Usuario,
      Sitio,
      Trabajador,
    ]),
    NotificacionesModule,
  ],
  controllers: [SolicitudesController],
  providers: [SolicitudesService],
})
export class SolicitudesModule {}
