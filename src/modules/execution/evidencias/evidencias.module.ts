import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InformesModule } from '../informes/informes.module.js';
import { Evidencia } from './entities/evidencia.entity.js';
import { EvidenciasController } from './evidencias.controller.js';
import { EvidenciasService } from './evidencias.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Evidencia]), InformesModule],
  controllers: [EvidenciasController],
  providers: [EvidenciasService],
})
export class EvidenciasModule {}
