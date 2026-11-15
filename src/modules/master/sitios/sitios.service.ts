import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type FindOptionsWhere, ILike, Repository } from 'typeorm';
import { ClientesService } from '../clientes/clientes.service.js';
import type {
  ActualizarSitioDto,
  CrearSitioDto,
  FiltrosSitioDto,
} from './dto/sitio.schema.js';
import { Sitio } from './entities/sitio.entity.js';

@Injectable()
export class SitiosService {
  constructor(
    @InjectRepository(Sitio)
    private readonly sitios: Repository<Sitio>,
    private readonly clientes: ClientesService,
  ) {}

  /** Lista los sitios; `q` busca en el código o en el nombre, sin distinguir mayúsculas. */
  listar(filtros: FiltrosSitioDto): Promise<Sitio[]> {
    const base: FindOptionsWhere<Sitio> = {};
    if (filtros.clienteId) base.clienteId = filtros.clienteId;
    if (filtros.activo !== undefined) base.activo = filtros.activo;

    const where = filtros.q
      ? [
          { ...base, codigo: ILike(`%${escaparLike(filtros.q)}%`) },
          { ...base, nombre: ILike(`%${escaparLike(filtros.q)}%`) },
        ]
      : base;

    return this.sitios.find({
      where,
      relations: { cliente: true },
      order: { codigo: 'ASC' },
    });
  }

  async obtener(id: string): Promise<Sitio> {
    const sitio = await this.sitios.findOne({
      where: { id },
      relations: { cliente: true },
    });
    if (!sitio) throw new NotFoundException('El sitio no existe');
    return sitio;
  }

  async crear(dto: CrearSitioDto): Promise<Sitio> {
    await this.exigirCodigoLibre(dto.codigo);
    await this.exigirClienteActivo(dto.clienteId);
    const { id } = await this.sitios.save(this.sitios.create(dto));
    return this.obtener(id);
  }

  async actualizar(id: string, dto: ActualizarSitioDto): Promise<Sitio> {
    const sitio = await this.obtener(id);
    if (dto.codigo && dto.codigo !== sitio.codigo) {
      await this.exigirCodigoLibre(dto.codigo);
    }
    if (dto.clienteId && dto.clienteId !== sitio.clienteId) {
      await this.exigirClienteActivo(dto.clienteId);
    }
    // Se quita la relación cargada para que TypeORM use el nuevo clienteId.
    delete sitio.cliente;
    Object.assign(sitio, dto);
    await this.sitios.save(sitio);
    return this.obtener(id);
  }

  private async exigirCodigoLibre(codigo: string): Promise<void> {
    if (await this.sitios.existsBy({ codigo })) {
      throw new ConflictException('Ya existe un sitio con ese código');
    }
  }

  private async exigirClienteActivo(clienteId: string): Promise<void> {
    const cliente = await this.clientes.obtener(clienteId);
    if (!cliente.activo) {
      throw new ConflictException('El cliente está desactivado');
    }
  }
}

/** Evita que %, _ o \ escritos por el usuario actúen como comodines. */
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, '\\$&');
}
