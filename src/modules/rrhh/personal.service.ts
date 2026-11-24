import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type FindOptionsWhere, ILike, Repository } from 'typeorm';
import { escaparLike } from '../../shared/database/escapar-like.js';
import type {
  ActualizarTrabajadorDto,
  CrearTrabajadorDto,
  FiltrosPersonalDto,
} from './dto/rrhh.schema.js';
import { TipoTrabajador, Trabajador } from './entities/trabajador.entity.js';

@Injectable()
export class PersonalService {
  constructor(
    @InjectRepository(Trabajador)
    private readonly trabajadores: Repository<Trabajador>,
  ) {}

  /** Lista el personal; `q` busca en nombres, DNI o cargo. */
  listar(filtros: FiltrosPersonalDto): Promise<Trabajador[]> {
    const base: FindOptionsWhere<Trabajador> = {};
    if (filtros.activo !== undefined) base.activo = filtros.activo;
    if (filtros.tipo) base.tipo = filtros.tipo;
    const q = filtros.q ? `%${escaparLike(filtros.q)}%` : null;
    const where = q
      ? [
          { ...base, nombres: ILike(q) },
          { ...base, dni: ILike(q) },
          { ...base, cargo: ILike(q) },
        ]
      : base;
    return this.trabajadores.find({ where, order: { nombres: 'ASC' } });
  }

  async obtener(id: string): Promise<Trabajador> {
    const t = await this.trabajadores.findOneBy({ id });
    if (!t) throw new NotFoundException('El trabajador no existe');
    return t;
  }

  async crear(dto: CrearTrabajadorDto): Promise<Trabajador> {
    if (dto.dni) await this.exigirDniLibre(dto.dni);
    const t = this.trabajadores.create(this.limpiar(dto));
    return this.trabajadores.save(t);
  }

  async actualizar(
    id: string,
    dto: ActualizarTrabajadorDto,
  ): Promise<Trabajador> {
    const t = await this.obtener(id);
    if (dto.dni && dto.dni !== t.dni) await this.exigirDniLibre(dto.dni);
    Object.assign(t, this.limpiar(dto));
    return this.trabajadores.save(t);
  }

  /** Un jornalero no lleva sueldo y un fijo no lleva pago por día obligatorio. */
  private limpiar<T extends CrearTrabajadorDto>(dto: T) {
    return {
      ...dto,
      dni: dto.dni ?? null,
      pagoDia: dto.pagoDia ?? null,
      sueldo: dto.tipo === TipoTrabajador.FIJO ? (dto.sueldo ?? null) : null,
      periodicidad:
        dto.tipo === TipoTrabajador.FIJO ? (dto.periodicidad ?? null) : null,
    };
  }

  private async exigirDniLibre(dni: string) {
    const otro = await this.trabajadores.findOneBy({ dni });
    if (otro)
      throw new ConflictException(`El DNI ${dni} ya es de ${otro.nombres}`);
  }
}
