import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UsuariosService } from '../../modules/core/usuarios/usuarios.service.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type {
  JwtPayload,
  RequestConUsuario,
} from '../auth/types/usuario-autenticado.js';

/**
 * Exige un token válido en todas las rutas, salvo las marcadas con @Public().
 * Además vuelve a leer al usuario en la base: si lo desactivaron o le cambiaron
 * el rol, el cambio rige de inmediato y no recién cuando vence el token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly usuarios: UsuariosService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestConUsuario>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Falta el token de acceso');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('La sesión no es válida o ya venció');
    }

    const usuario = await this.usuarios.buscarActivo(payload.sub);
    if (!usuario) {
      throw new UnauthorizedException('Tu usuario está desactivado');
    }
    request.usuario = {
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
    };
    return true;
  }
}
