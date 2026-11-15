import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { escaparLike } from '../../../shared/database/escapar-like.js';
import { redondear2 } from '../../../shared/entities/numerico.transformer.js';
import { ETAPAS_EN_ORDEN } from '../../../shared/enums/etapa-evidencia.enum.js';
import { Evidencia } from '../../execution/evidencias/entities/evidencia.entity.js';
import { Informe } from '../../execution/informes/entities/informe.entity.js';
import { ClientesService } from '../../master/clientes/clientes.service.js';
import { SitiosService } from '../../master/sitios/sitios.service.js';
import type {
  ActualizarItemDto,
  ActualizarOrdenDto,
  CrearItemDto,
  CrearOrdenDto,
  FiltrosOrdenDto,
} from './dto/orden-compra.schema.js';
import { ItemOrden } from './entities/item-orden.entity.js';
import { EstadoOrden, OrdenCompra } from './entities/orden-compra.entity.js';

export type ItemConMonto = ItemOrden & { monto: number };

/** Orden con sus ítems; cada ítem trae su monto y la orden, el subtotal. */
export type OrdenDetalle = Omit<OrdenCompra, 'items'> & {
  items: ItemConMonto[];
  subtotal: number;
};

/** Fila de la lista de órdenes: sin ítems, con el conteo y el subtotal. */
export type OrdenResumen = Omit<OrdenCompra, 'items'> & {
  cantidadItems: number;
  subtotal: number;
};

@Injectable()
export class OrdenesCompraService {
  constructor(
    @InjectRepository(OrdenCompra)
    private readonly ordenes: Repository<OrdenCompra>,
    @InjectRepository(ItemOrden)
    private readonly items: Repository<ItemOrden>,
    private readonly clientes: ClientesService,
    private readonly sitios: SitiosService,
  ) {}

  /** Lista las órdenes, de la más reciente a la más antigua. */
  async listar(filtros: FiltrosOrdenDto): Promise<OrdenResumen[]> {
    const qb = this.ordenes
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.cliente', 'c')
      .leftJoinAndSelect('o.items', 'i')
      .orderBy('o.fechaEmision', 'DESC')
      .addOrderBy('o.numero', 'DESC');

    if (filtros.clienteId) {
      qb.andWhere('o.clienteId = :clienteId', { clienteId: filtros.clienteId });
    }
    if (filtros.estado) {
      qb.andWhere('o.estado = :estado', { estado: filtros.estado });
    }
    if (filtros.q) {
      qb.andWhere('o.numero ILIKE :q', { q: `%${escaparLike(filtros.q)}%` });
    }
    if (filtros.sitioId) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM items_orden x WHERE x.orden_id = o.id AND x.sitio_id = :sitioId)',
        { sitioId: filtros.sitioId },
      );
    }

    const ordenes = await qb.getMany();
    return ordenes.map(({ items = [], ...orden }) => ({
      ...orden,
      cantidadItems: items.length,
      subtotal: subtotal(items),
    }));
  }

  async obtener(id: string): Promise<OrdenDetalle> {
    const orden = await this.ordenes.findOne({
      where: { id },
      relations: { cliente: true, items: { sitio: true } },
      order: { items: { posicion: 'ASC' } },
    });
    if (!orden) throw new NotFoundException('La orden de compra no existe');

    const { items = [], ...cabecera } = orden;
    return {
      ...cabecera,
      items: items.map((item) => Object.assign(item, { monto: monto(item) })),
      subtotal: subtotal(items),
    };
  }

  /** Registra la orden con todos sus ítems en una sola operación. */
  async crear(dto: CrearOrdenDto): Promise<OrdenDetalle> {
    const cliente = await this.clientes.obtener(dto.clienteId);
    if (!cliente.activo) {
      throw new ConflictException('El cliente está desactivado');
    }
    await this.exigirNumeroLibre(dto.clienteId, dto.numero);
    await this.sitios.exigirDelCliente(
      dto.items.map((i) => i.sitioId),
      dto.clienteId,
    );

    const posiciones = asignarPosiciones(dto.items, 0);
    const { id } = await this.ordenes.save(
      this.ordenes.create({
        numero: dto.numero,
        clienteId: dto.clienteId,
        fechaEmision: dto.fechaEmision,
        moneda: dto.moneda ?? 'PEN',
        observaciones: dto.observaciones ?? null,
        items: dto.items.map((item, i) =>
          this.items.create(nuevoItem(item, posiciones[i])),
        ),
      }),
    );
    return this.obtener(id);
  }

  async actualizar(id: string, dto: ActualizarOrdenDto): Promise<OrdenDetalle> {
    const orden = await this.buscar(id);
    if (dto.numero && dto.numero !== orden.numero) {
      await this.exigirNumeroLibre(orden.clienteId, dto.numero);
    }
    Object.assign(orden, dto);
    await this.ordenes.save(orden);
    return this.obtener(id);
  }

  async agregarItem(ordenId: string, dto: CrearItemDto): Promise<OrdenDetalle> {
    const orden = await this.buscarEditable(ordenId);
    await this.sitios.exigirDelCliente([dto.sitioId], orden.clienteId);

    let posicion = dto.posicion;
    if (posicion === undefined) {
      const ultima = await this.items.maximum('posicion', { ordenId });
      [posicion] = asignarPosiciones([dto], ultima ?? 0);
    } else {
      await this.exigirPosicionLibre(ordenId, posicion);
    }

    await this.items.save(
      this.items.create({ ...nuevoItem(dto, posicion), ordenId }),
    );
    return this.obtener(ordenId);
  }

  async actualizarItem(
    ordenId: string,
    itemId: string,
    dto: ActualizarItemDto,
  ): Promise<OrdenDetalle> {
    const orden = await this.buscarEditable(ordenId);
    const item = await this.buscarItem(ordenId, itemId);
    if (dto.sitioId && dto.sitioId !== item.sitioId) {
      await this.exigirSinEvidencias(item, 'cambiar de sitio');
      await this.sitios.exigirDelCliente([dto.sitioId], orden.clienteId);
    }
    if (dto.posicion !== undefined && dto.posicion !== item.posicion) {
      await this.exigirPosicionLibre(ordenId, dto.posicion);
    }
    Object.assign(item, dto);
    await this.items.save(item);
    return this.obtener(ordenId);
  }

  async eliminarItem(ordenId: string, itemId: string): Promise<OrdenDetalle> {
    await this.buscarEditable(ordenId);
    const item = await this.buscarItem(ordenId, itemId);
    if ((await this.items.countBy({ ordenId })) <= 1) {
      throw new ConflictException('La orden necesita al menos un ítem');
    }
    await this.exigirSinEvidencias(item, 'quitar');
    await this.items.remove(item);
    return this.obtener(ordenId);
  }

  /**
   * Protege lo ya documentado en campo: una actividad con fotos no se quita ni
   * cambia de sitio, y un informe abierto no se queda sin actividades.
   */
  private async exigirSinEvidencias(
    item: ItemOrden,
    accion: string,
  ): Promise<void> {
    const em = this.items.manager;
    if (await em.existsBy(Evidencia, { itemId: item.id })) {
      throw new ConflictException(
        `La actividad ${item.posicion} ya tiene fotos; no se puede ${accion}`,
      );
    }
    const tieneInforme = await em.existsBy(Informe, {
      ordenId: item.ordenId,
      sitioId: item.sitioId,
    });
    const delMismoSitio = await this.items.countBy({
      ordenId: item.ordenId,
      sitioId: item.sitioId,
    });
    if (tieneInforme && delMismoSitio <= 1) {
      throw new ConflictException(
        `La actividad ${item.posicion} es la única de su sitio, que ya tiene informe; no se puede ${accion}`,
      );
    }
  }

  private async buscar(id: string): Promise<OrdenCompra> {
    const orden = await this.ordenes.findOneBy({ id });
    if (!orden) throw new NotFoundException('La orden de compra no existe');
    return orden;
  }

  /** Los ítems solo cambian mientras la orden está ABIERTA. */
  private async buscarEditable(id: string): Promise<OrdenCompra> {
    const orden = await this.buscar(id);
    if (orden.estado !== EstadoOrden.ABIERTA) {
      throw new ConflictException(
        'Solo se pueden cambiar los ítems de una orden ABIERTA',
      );
    }
    return orden;
  }

  private async buscarItem(ordenId: string, id: string): Promise<ItemOrden> {
    const item = await this.items.findOneBy({ id, ordenId });
    if (!item) throw new NotFoundException('El ítem no existe en esta orden');
    return item;
  }

  private async exigirNumeroLibre(
    clienteId: string,
    numero: string,
  ): Promise<void> {
    if (await this.ordenes.existsBy({ clienteId, numero })) {
      throw new ConflictException(
        'Ese cliente ya tiene una orden con ese número',
      );
    }
  }

  private async exigirPosicionLibre(
    ordenId: string,
    posicion: number,
  ): Promise<void> {
    if (await this.items.existsBy({ ordenId, posicion })) {
      throw new ConflictException(`La posición ${posicion} ya está ocupada`);
    }
  }
}

/** Campos de un ítem nuevo, con los valores por omisión aplicados. */
function nuevoItem(item: CrearItemDto, posicion: number): Partial<ItemOrden> {
  return {
    posicion,
    sitioId: item.sitioId,
    codigoMaterial: item.codigoMaterial ?? null,
    descripcion: item.descripcion,
    detalle: item.detalle ?? null,
    cantidad: item.cantidad,
    unidad: item.unidad,
    precioUnitario: item.precioUnitario,
    fechaEntrega: item.fechaEntrega ?? null,
    etapas: item.etapas ?? [...ETAPAS_EN_ORDEN],
  };
}

/**
 * Respeta las posiciones indicadas y numera las demás de 10 en 10,
 * siguiendo a la mayor ya usada (como las órdenes del cliente: 10, 20, 30…).
 */
function asignarPosiciones(
  items: { posicion?: number }[],
  mayorExistente: number,
): number[] {
  let mayor = Math.max(mayorExistente, ...items.map((i) => i.posicion ?? 0));
  return items.map((i) => {
    if (i.posicion !== undefined) return i.posicion;
    mayor = Math.floor(mayor / 10) * 10 + 10;
    return mayor;
  });
}

function monto(item: ItemOrden): number {
  return redondear2(item.cantidad * item.precioUnitario);
}

function subtotal(items: ItemOrden[]): number {
  return redondear2(items.reduce((total, item) => total + monto(item), 0));
}
