import { Module } from '@nestjs/common';
import { OrdenesCompraModule } from './ordenes-compra/ordenes-compra.module.js';

/** Planificación: órdenes de compra y sus ítems (las actividades a ejecutar). */
@Module({
  imports: [OrdenesCompraModule],
  exports: [OrdenesCompraModule],
})
export class PlanningModule {}
