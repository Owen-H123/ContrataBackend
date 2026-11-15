import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { In, Repository } from 'typeorm';
import { Rol } from '../../../shared/enums/rol.enum.js';
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

  /** Usuario vigente para una sesión: null si no existe o está desactivado. */
  buscarActivo(id: string): Promise<Usuario | null> {
    return this.usuarios.findOneBy({ id, activo: true });
  }

  /** Devuelve los técnicos indicados; falla si alguno no existe, no es TECNICO o está inactivo. */
  async exigirTecnicosActivos(ids: string[]): Promise<Usuario[]> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return [];
    const encontrados = await this.usuarios.findBy({ id: In(unicos) });
    if (encontrados.length !== unicos.length) {
      throw new NotFoundException('Uno de los técnicos no existe');
    }
    const invalido = encontrados.find(
      (u) => u.rol !== Rol.TECNICO || !u.activo,
    );
    if (invalido) {
      throw new ConflictException(`${invalido.nombre} no es un técnico activo`);
    }
    return encontrados;
  }

  /** Usuario con su hash, para verificar la contraseña actual. */
  async buscarConHash(id: string): Promise<Usuario> {
    const usuario = await this.usuarios
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id })
      .getOne();
    if (!usuario) throw new NotFoundException('El usuario no existe');
    return usuario;
  }

  /** Lee el hash de la contraseña para iniciar sesión. */
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
    await this.evitarQuedarSinAdmin(usuario, dto);
    const { password, ...cambios } = dto;
    Object.assign(usuario, cambios);
    if (password)
      usuario.passwordHash = await bcrypt.hash(password, RONDAS_HASH);
    await this.usuarios.save(usuario);
    return this.obtener(id);
  }

  /** Impide desactivar o quitarle el rol al último administrador activo. */
  private async evitarQuedarSinAdmin(
    usuario: Usuario,
    dto: ActualizarUsuarioDto,
  ): Promise<void> {
    const eraAdminActivo = usuario.rol === Rol.ADMIN && usuario.activo;
    const dejaDeSerlo =
      (dto.rol !== undefined && dto.rol !== Rol.ADMIN) || dto.activo === false;
    if (!eraAdminActivo || !dejaDeSerlo) return;

    const adminsActivos = await this.usuarios.countBy({
      rol: Rol.ADMIN,
      activo: true,
    });
    if (adminsActivos <= 1) {
      throw new ConflictException(
        'Debe quedar al menos un administrador activo',
      );
    }
  }
}
