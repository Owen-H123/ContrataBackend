import { Module } from '@nestjs/common';
import { OrdenesCompraModule } from './ordenes-compra/ordenes-compra.module.js';
import { TrabajosModule } from './trabajos/trabajos.module.js';

/** Planificación: órdenes de compra, sus ítems y el seguimiento de cada trabajo. */
@Module({
  imports: [OrdenesCompraModule, TrabajosModule],
  exports: [OrdenesCompraModule, TrabajosModule],
})
export class PlanningModule {}
