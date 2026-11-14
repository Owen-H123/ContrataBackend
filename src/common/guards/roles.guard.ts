import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { Rol } from '../enums/rol.enum.js';
import type { RequestConUsuario } from '../types/usuario-autenticado.js';

/** Aplica @Roles(): rechaza al usuario cuyo rol no está en la lista de la ruta. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Rol[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) return true;

    const { usuario } = context.switchToHttp().getRequest<RequestConUsuario>();
    if (!usuario || !roles.includes(usuario.rol)) {
      throw new ForbiddenException('Tu rol no tiene permiso para esta acción');
    }
    return true;
  }
}
