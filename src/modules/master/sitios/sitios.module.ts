import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientesModule } from '../clientes/clientes.module.js';
import { Sitio } from './entities/sitio.entity.js';
import { SitiosController } from './sitios.controller.js';
import { SitiosService } from './sitios.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Sitio]), ClientesModule],
  controllers: [SitiosController],
  providers: [SitiosService],
  exports: [SitiosService],
})
export class SitiosModule {}
