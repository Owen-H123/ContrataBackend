import { Module } from '@nestjs/common';
import { EvidenciasModule } from './evidencias/evidencias.module.js';
import { InformesModule } from './informes/informes.module.js';

/** Ejecución en campo: informes por orden y sitio, técnicos asignados, evidencias, envío y revisión. */
@Module({
  imports: [InformesModule, EvidenciasModule],
  exports: [InformesModule],
})
export class ExecutionModule {}
