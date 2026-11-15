import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientesModule } from '../../master/clientes/clientes.module.js';
import { SitiosModule } from '../../master/sitios/sitios.module.js';
import { ItemOrden } from './entities/item-orden.entity.js';
import { OrdenCompra } from './entities/orden-compra.entity.js';
import { OrdenesCompraController } from './ordenes-compra.controller.js';
import { OrdenesCompraService } from './ordenes-compra.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrdenCompra, ItemOrden]),
    ClientesModule,
    SitiosModule,
  ],
  controllers: [OrdenesCompraController],
  providers: [OrdenesCompraService],
  exports: [OrdenesCompraService],
})
export class OrdenesCompraModule {}
