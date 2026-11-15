import type { Request } from 'express';
import type { Rol } from '../../../shared/enums/rol.enum.js';

/** Contenido del token de acceso. */
export interface JwtPayload {
  sub: string;
  nombre: string;
  rol: Rol;
}

/** Usuario que hace la petición, ya verificado por JwtAuthGuard. */
export interface UsuarioAutenticado {
  id: string;
  nombre: string;
  rol: Rol;
}

export interface RequestConUsuario extends Request {
  usuario?: UsuarioAutenticado;
}
