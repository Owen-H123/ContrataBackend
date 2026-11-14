import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type {
  JwtPayload,
  RequestConUsuario,
} from '../types/usuario-autenticado.js';

/** Exige un token válido en todas las rutas, salvo las marcadas con @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
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

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      request.usuario = {
        id: payload.sub,
        nombre: payload.nombre,
        rol: payload.rol,
      };
    } catch {
      throw new UnauthorizedException('La sesión no es válida o ya venció');
    }
    return true;
  }
}
