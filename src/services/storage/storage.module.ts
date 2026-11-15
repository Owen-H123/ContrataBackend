import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service.js';

/** Disponible en toda la aplicación: cualquier módulo puede inyectar StorageService. */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
