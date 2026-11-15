import { Module } from '@nestjs/common';
import { ClientesModule } from './clientes/clientes.module.js';
import { SitiosModule } from './sitios/sitios.module.js';

/** Datos maestros: clientes y sitios que usan las órdenes de compra. */
@Module({
  imports: [ClientesModule, SitiosModule],
  exports: [ClientesModule, SitiosModule],
})
export class MasterModule {}
