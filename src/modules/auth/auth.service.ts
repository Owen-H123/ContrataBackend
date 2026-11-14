import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { JwtPayload } from '../../common/types/usuario-autenticado.js';
import type { Usuario } from '../usuarios/entities/usuario.entity.js';
import { UsuariosService } from '../usuarios/usuarios.service.js';
import type { LoginDto } from './dto/login.schema.js';

export interface SesionDto {
  accessToken: string;
  usuario: Pick<Usuario, 'id' | 'nombre' | 'usuario' | 'rol'>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usuarios: UsuariosService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<SesionDto> {
    const usuario = await this.usuarios.buscarParaLogin(dto.usuario);
    const valido =
      !!usuario &&
      usuario.activo &&
      (await bcrypt.compare(dto.password, usuario.passwordHash));
    // Mismo mensaje en todos los casos: no revela si el usuario existe.
    if (!valido)
      throw new UnauthorizedException('Usuario o contraseña incorrectos');

    const payload: JwtPayload = {
      sub: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        usuario: usuario.usuario,
        rol: usuario.rol,
      },
    };
  }

  /** Vuelve a leer al usuario: confirma que sigue activo y devuelve su rol actual. */
  async perfil(id: string): Promise<SesionDto['usuario']> {
    const usuario = await this.usuarios.obtener(id);
    if (!usuario.activo)
      throw new UnauthorizedException('Tu usuario está desactivado');
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      usuario: usuario.usuario,
      rol: usuario.rol,
    };
  }
}
