import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type {
  RequestConUsuario,
  UsuarioAutenticado,
} from '../types/usuario-autenticado.js';

/** Entrega al controlador el usuario que hace la petición. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UsuarioAutenticado | undefined =>
    context.switchToHttp().getRequest<RequestConUsuario>().usuario,
);
