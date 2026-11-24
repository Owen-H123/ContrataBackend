import { Usuario } from '../../modules/core/usuarios/entities/usuario.entity.js';
import { Notificacion } from '../../modules/core/notificaciones/entities/notificacion.entity.js';
import { Cliente } from '../../modules/master/clientes/entities/cliente.entity.js';
import { Sitio } from '../../modules/master/sitios/entities/sitio.entity.js';
import { ItemOrden } from '../../modules/planning/ordenes-compra/entities/item-orden.entity.js';
import { OrdenCompra } from '../../modules/planning/ordenes-compra/entities/orden-compra.entity.js';
import { Informe } from '../../modules/execution/informes/entities/informe.entity.js';
import { RevisionInforme } from '../../modules/execution/informes/entities/revision-informe.entity.js';
import { Evidencia } from '../../modules/execution/evidencias/entities/evidencia.entity.js';
import { VisitaTecnica } from '../../modules/execution/visitas/entities/visita-tecnica.entity.js';
import { HallazgoVisita } from '../../modules/execution/visitas/entities/hallazgo-visita.entity.js';
import { FotoVisita } from '../../modules/execution/visitas/entities/foto-visita.entity.js';
import { ComentarioVisita } from '../../modules/execution/visitas/entities/comentario-visita.entity.js';
import { Trabajador } from '../../modules/rrhh/entities/trabajador.entity.js';
import { TareoFila } from '../../modules/rrhh/entities/tareo-fila.entity.js';
import { TareoMovimiento } from '../../modules/rrhh/entities/tareo-movimiento.entity.js';
import { SolicitudDinero } from '../../modules/finanzas/solicitudes/entities/solicitud-dinero.entity.js';
import { ArchivoSolicitud } from '../../modules/finanzas/solicitudes/entities/archivo-solicitud.entity.js';

/**
 * Lista única de entidades. La usan la aplicación y la línea de comandos de
 * migraciones, así ambas ven siempre el mismo modelo. Cada entidad nueva se agrega aquí.
 */
export const entities = [
  Usuario,
  Notificacion,
  Cliente,
  Sitio,
  OrdenCompra,
  ItemOrden,
  Informe,
  RevisionInforme,
  Evidencia,
  VisitaTecnica,
  HallazgoVisita,
  FotoVisita,
  ComentarioVisita,
  Trabajador,
  TareoFila,
  TareoMovimiento,
  SolicitudDinero,
  ArchivoSolicitud,
];
