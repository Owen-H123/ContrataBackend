import { Module } from '@nestjs/common';
import { EvidenciasModule } from './evidencias/evidencias.module.js';
import { InformesModule } from './informes/informes.module.js';
import { VisitasModule } from './visitas/visitas.module.js';

/**
 * Ejecución en campo: informes por orden y sitio, técnicos asignados, evidencias, envío y revisión;
 * y visitas técnicas que registra el propio técnico.
 */
@Module({
  imports: [InformesModule, EvidenciasModule, VisitasModule],
  exports: [InformesModule],
})
export class ExecutionModule {}
