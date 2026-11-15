import { Usuario } from '../../modules/core/usuarios/entities/usuario.entity.js';
import { Cliente } from '../../modules/master/clientes/entities/cliente.entity.js';
import { Sitio } from '../../modules/master/sitios/entities/sitio.entity.js';
import { ItemOrden } from '../../modules/planning/ordenes-compra/entities/item-orden.entity.js';
import { OrdenCompra } from '../../modules/planning/ordenes-compra/entities/orden-compra.entity.js';
import { Informe } from '../../modules/execution/informes/entities/informe.entity.js';
import { RevisionInforme } from '../../modules/execution/informes/entities/revision-informe.entity.js';
import { Evidencia } from '../../modules/execution/evidencias/entities/evidencia.entity.js';

/**
 * Lista única de entidades. La usan la aplicación y la línea de comandos de
 * migraciones, así ambas ven siempre el mismo modelo. Cada entidad nueva se agrega aquí.
 */
export const entities = [
  Usuario,
  Cliente,
  Sitio,
  OrdenCompra,
  ItemOrden,
  Informe,
  RevisionInforme,
  Evidencia,
];
