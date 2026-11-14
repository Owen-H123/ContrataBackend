import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import type {
  ActualizarUsuarioDto,
  CrearUsuarioDto,
} from './dto/usuario.schema.js';
import { Usuario } from './entities/usuario.entity.js';

const RONDAS_HASH = 12;

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
  ) {}

  listar(): Promise<Usuario[]> {
    return this.usuarios.find({ order: { nombre: 'ASC' } });
  }

  async obtener(id: string): Promise<Usuario> {
    const usuario = await this.usuarios.findOneBy({ id });
    if (!usuario) throw new NotFoundException('El usuario no existe');
    return usuario;
  }

  /** Único punto donde se lee el hash de la contraseña. */
  buscarParaLogin(usuario: string): Promise<Usuario | null> {
    return this.usuarios
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.usuario = :usuario', { usuario })
      .getOne();
  }

  async crear(dto: CrearUsuarioDto): Promise<Usuario> {
    if (await this.usuarios.existsBy({ usuario: dto.usuario })) {
      throw new ConflictException('Ese nombre de usuario ya está en uso');
    }
    const { id } = await this.usuarios.save(
      this.usuarios.create({
        nombre: dto.nombre,
        usuario: dto.usuario,
        rol: dto.rol,
        passwordHash: await bcrypt.hash(dto.password, RONDAS_HASH),
      }),
    );
    return this.obtener(id);
  }

  async actualizar(id: string, dto: ActualizarUsuarioDto): Promise<Usuario> {
    const usuario = await this.obtener(id);
    const { password, ...cambios } = dto;
    Object.assign(usuario, cambios);
    if (password)
      usuario.passwordHash = await bcrypt.hash(password, RONDAS_HASH);
    await this.usuarios.save(usuario);
    return this.obtener(id);
  }
}
