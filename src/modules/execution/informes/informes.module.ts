import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuariosModule } from '../../core/usuarios/usuarios.module.js';
import { ItemOrden } from '../../planning/ordenes-compra/entities/item-orden.entity.js';
import { OrdenesCompraModule } from '../../planning/ordenes-compra/ordenes-compra.module.js';
import { Informe } from './entities/informe.entity.js';
import { InformesController } from './informes.controller.js';
import { InformesService } from './informes.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Informe, ItemOrden]),
    OrdenesCompraModule,
    UsuariosModule,
  ],
  controllers: [InformesController],
  providers: [InformesService],
  exports: [InformesService],
})
export class InformesModule {}
