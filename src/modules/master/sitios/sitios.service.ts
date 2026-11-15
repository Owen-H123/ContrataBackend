import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import { escaparLike } from '../../../shared/database/escapar-like.js';
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

  /**
   * Confirma que todos los sitios existen, están activos y son del cliente indicado.
   * Lo usan las órdenes de compra antes de guardar sus ítems.
   */
  async exigirDelCliente(ids: string[], clienteId: string): Promise<void> {
    const unicos = [...new Set(ids)];
    const encontrados = await this.sitios.findBy({ id: In(unicos) });
    if (encontrados.length !== unicos.length) {
      throw new NotFoundException('Uno de los sitios no existe');
    }
    const ajeno = encontrados.find((s) => s.clienteId !== clienteId);
    if (ajeno) {
      throw new ConflictException(
        `El sitio ${ajeno.codigo} no pertenece al cliente de la orden`,
      );
    }
    const inactivo = encontrados.find((s) => !s.activo);
    if (inactivo) {
      throw new ConflictException(
        `El sitio ${inactivo.codigo} está desactivado`,
      );
    }
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
