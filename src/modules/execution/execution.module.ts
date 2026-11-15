import { Module } from '@nestjs/common';
import { InformesModule } from './informes/informes.module.js';

/** Ejecución en campo: informes por orden y sitio, técnicos asignados y, luego, evidencias. */
@Module({
  imports: [InformesModule],
  exports: [InformesModule],
})
export class ExecutionModule {}
