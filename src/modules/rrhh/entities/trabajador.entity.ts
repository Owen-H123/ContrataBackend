import { Column, Entity } from 'typeorm';
import { EntidadBase } from '../../../shared/entities/base.entity.js';
import { numerico } from '../../../shared/entities/numerico.transformer.js';

/** Cómo se le paga: por día trabajado (tareo) o con sueldo fijo. */
export enum TipoTrabajador {
  JORNAL = 'JORNAL',
  FIJO = 'FIJO',
}

/** Cada cuánto se paga el sueldo del personal fijo. */
export enum PeriodicidadSueldo {
  QUINCENAL = 'QUINCENAL',
  MENSUAL = 'MENSUAL',
}

/**
 * Persona que trabaja para RYSCOM (técnico, torrero, chofer, coordinador…).
 * No es lo mismo que un usuario del sistema: la mayoría del personal no ingresa al sistema.
 */
@Entity('trabajadores')
export class Trabajador extends EntidadBase {
  /** Apellidos y nombres, como en la planilla. */
  @Column({ type: 'varchar', length: 160 })
  nombres: string;

  /** DNI de 8 dígitos (o carné de extranjería). Único si se indica. */
  @Column({ type: 'varchar', length: 12, nullable: true, unique: true })
  dni: string | null;

  /** Cargo habitual (TÉCNICO, TORRERO, CHOFER…); en cada semana del tareo se puede cambiar. */
  @Column({ type: 'varchar', length: 60 })
  cargo: string;

  @Column({
    type: 'enum',
    enum: TipoTrabajador,
    default: TipoTrabajador.JORNAL,
  })
  tipo: TipoTrabajador;

  /** Pago por día (jornal). Sirve de valor inicial en cada semana del tareo. */
  @Column({
    name: 'pago_dia',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numerico,
  })
  pagoDia: number | null;

  /** Sueldo del personal fijo, por periodo. */
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numerico,
  })
  sueldo: number | null;

  @Column({ type: 'enum', enum: PeriodicidadSueldo, nullable: true })
  periodicidad: PeriodicidadSueldo | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefono: string | null;

  /** Banco y número de cuenta (o celular de Yape/Plin) donde se le paga. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  banco: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  cuenta: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  /**
   * Algo que revisar en la ficha, por ejemplo: «En el Excel tenía el DNI 12345678, que ya es
   * de …». Lo deja el importador; se borra al guardar la ficha corregida.
   */
  @Column({ type: 'varchar', length: 300, nullable: true })
  observacion: string | null;
}
