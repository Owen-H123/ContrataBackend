import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificacionesModule } from '../../core/notificaciones/notificaciones.module.js';
import { UsuariosModule } from '../../core/usuarios/usuarios.module.js';
import { ItemOrden } from '../../planning/ordenes-compra/entities/item-orden.entity.js';
import { OrdenesCompraModule } from '../../planning/ordenes-compra/ordenes-compra.module.js';
import { Evidencia } from '../evidencias/entities/evidencia.entity.js';
import { Informe } from './entities/informe.entity.js';
import { RevisionInforme } from './entities/revision-informe.entity.js';
import { InformesController } from './informes.controller.js';
import { InformesService } from './informes.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Informe, ItemOrden, Evidencia, RevisionInforme]),
    OrdenesCompraModule,
    UsuariosModule,
    NotificacionesModule,
  ],
  controllers: [InformesController],
  providers: [InformesService],
  exports: [InformesService],
})
export class InformesModule {}
