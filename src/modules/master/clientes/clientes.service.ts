import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  ActualizarClienteDto,
  CrearClienteDto,
} from './dto/cliente.schema.js';
import { Cliente } from './entities/cliente.entity.js';

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(Cliente)
    private readonly clientes: Repository<Cliente>,
  ) {}

  listar(): Promise<Cliente[]> {
    return this.clientes.find({ order: { razonSocial: 'ASC' } });
  }

  async obtener(id: string): Promise<Cliente> {
    const cliente = await this.clientes.findOneBy({ id });
    if (!cliente) throw new NotFoundException('El cliente no existe');
    return cliente;
  }

  async crear(dto: CrearClienteDto): Promise<Cliente> {
    await this.exigirRucLibre(dto.ruc);
    return this.clientes.save(this.clientes.create(dto));
  }

  async actualizar(id: string, dto: ActualizarClienteDto): Promise<Cliente> {
    const cliente = await this.obtener(id);
    if (dto.ruc && dto.ruc !== cliente.ruc) await this.exigirRucLibre(dto.ruc);
    Object.assign(cliente, dto);
    return this.clientes.save(cliente);
  }

  private async exigirRucLibre(ruc: string): Promise<void> {
    if (await this.clientes.existsBy({ ruc })) {
      throw new ConflictException('Ya existe un cliente con ese RUC');
    }
  }
}
