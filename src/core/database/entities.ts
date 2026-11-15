import { Usuario } from '../../modules/core/usuarios/entities/usuario.entity.js';
import { Cliente } from '../../modules/master/clientes/entities/cliente.entity.js';
import { Sitio } from '../../modules/master/sitios/entities/sitio.entity.js';

/**
 * Lista única de entidades. La usan la aplicación y la línea de comandos de
 * migraciones, así ambas ven siempre el mismo modelo. Cada entidad nueva se agrega aquí.
 */
export const entities = [Usuario, Cliente, Sitio];
