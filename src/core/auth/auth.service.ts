import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { JwtPayload } from './types/usuario-autenticado.js';
import type { Usuario } from '../../modules/core/usuarios/entities/usuario.entity.js';
import { UsuariosService } from '../../modules/core/usuarios/usuarios.service.js';
import type { CambiarPasswordDto, LoginDto } from './dto/login.schema.js';
import { IntentosLogin } from './intentos-login.js';

/** Hash de una clave aleatoria, con el mismo costo que los reales (12 rondas). */
const HASH_SENUELO = bcrypt.hashSync(crypto.randomUUID(), 12);

export interface SesionDto {
  accessToken: string;
  usuario: Pick<Usuario, 'id' | 'nombre' | 'usuario' | 'rol'>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usuarios: UsuariosService,
    private readonly jwt: JwtService,
    private readonly intentos: IntentosLogin,
  ) {}

  async login(dto: LoginDto): Promise<SesionDto> {
    this.intentos.exigirPermitido(dto.usuario);
    const usuario = await this.usuarios.buscarParaLogin(dto.usuario);
    // Siempre se compara un hash, exista o no el usuario: así el tiempo de
    // respuesta no delata qué nombres de usuario existen.
    const coincide = await bcrypt.compare(
      dto.password,
      usuario?.passwordHash ?? HASH_SENUELO,
    );
    const valido = !!usuario && usuario.activo && coincide;
    // Mismo mensaje en todos los casos: no revela si el usuario existe.
    if (!valido) {
      this.intentos.registrarFallo(dto.usuario);
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }
    this.intentos.registrarExito(dto.usuario);

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

  /** El propio usuario cambia su contraseña confirmando la actual. */
  async cambiarPassword(id: string, dto: CambiarPasswordDto): Promise<void> {
    const usuario = await this.usuarios.buscarConHash(id);
    if (!(await bcrypt.compare(dto.actual, usuario.passwordHash))) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    if (dto.actual === dto.nueva) {
      throw new BadRequestException('La nueva contraseña debe ser distinta');
    }
    await this.usuarios.actualizar(id, { password: dto.nueva });
  }
}
