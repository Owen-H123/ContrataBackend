import { Column, Entity } from 'typeorm';
import { EntidadBase } from '../../../../shared/entities/base.entity.js';
import { Permiso } from '../../../../shared/enums/permiso.enum.js';
import { Rol } from '../../../../shared/enums/rol.enum.js';

@Entity('usuarios')
export class Usuario extends EntidadBase {
  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  /** Nombre de acceso, siempre en minúsculas. */
  @Column({ type: 'varchar', length: 60, unique: true })
  usuario: string;

  /** Nunca sale en las consultas normales; solo se lee al iniciar sesión. */
  @Column({ name: 'password_hash', type: 'varchar', select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: Rol, default: Rol.TECNICO })
  rol: Rol;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  /** Permisos sueltos, aparte del rol (p. ej. pedir, aprobar o abonar dinero). */
  @Column({ type: 'enum', enum: Permiso, array: true, default: '{}' })
  permisos: Permiso[];
}
