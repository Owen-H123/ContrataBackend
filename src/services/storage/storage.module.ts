import { Global, Module } from '@nestjs/common';
import { ArchivosLocalesController } from './archivos-locales.controller.js';
import { StorageService } from './storage.service.js';

/** Disponible en toda la aplicación: cualquier módulo puede inyectar StorageService. */
@Global()
@Module({
  controllers: [ArchivosLocalesController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
