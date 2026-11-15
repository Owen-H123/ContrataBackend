import { SetMetadata } from '@nestjs/common';
import type { Rol } from '../../shared/enums/rol.enum.js';

export const ROLES_KEY = 'roles';

/** Limita una ruta o un controlador a los roles indicados. Sin este decorador, entra cualquier usuario con sesión. */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);
