import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AllExceptionsFilter } from './core/filters/all-exceptions.filter.js';
import { JwtAuthGuard } from './core/guards/jwt-auth.guard.js';
import { RolesGuard } from './core/guards/roles.guard.js';
import { envSchema } from './core/config/env.schema.js';
import { DatabaseModule } from './core/database/database.module.js';
import { AuthModule } from './core/auth/auth.module.js';
import { HealthModule } from './modules/core/health/health.module.js';
import { NotificacionesModule } from './modules/core/notificaciones/notificaciones.module.js';
import { UsuariosModule } from './modules/core/usuarios/usuarios.module.js';
import { MasterModule } from './modules/master/master.module.js';
import { PlanningModule } from './modules/planning/planning.module.js';
import { ExecutionModule } from './modules/execution/execution.module.js';
import { RrhhModule } from './modules/rrhh/rrhh.module.js';
import { ContabilidadModule } from './modules/finanzas/contabilidad/contabilidad.module.js';
import { SolicitudesModule } from './modules/finanzas/solicitudes/solicitudes.module.js';
import { StorageModule } from './services/storage/storage.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    DatabaseModule,
    StorageModule,
    AuthModule,
    UsuariosModule,
    NotificacionesModule,
    HealthModule,
    MasterModule,
    PlanningModule,
    ExecutionModule,
    RrhhModule,
    SolicitudesModule,
    ContabilidadModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // El orden importa: primero se identifica al usuario, después se revisa su rol.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
