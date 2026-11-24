/**
 * Permisos sueltos que se dan a cada usuario, aparte de su rol.
 * Por ahora son los de solicitudes de dinero; el ADMIN los tiene todos.
 */
export enum Permiso {
  /** Puede pedir dinero (crear solicitudes). */
  PEDIR_DINERO = 'PEDIR_DINERO',
  /** Puede aprobar o rechazar solicitudes de otros. */
  APROBAR_DINERO = 'APROBAR_DINERO',
  /** Puede abonar (registrar el depósito de) las solicitudes aprobadas. */
  ABONAR_DINERO = 'ABONAR_DINERO',
}
