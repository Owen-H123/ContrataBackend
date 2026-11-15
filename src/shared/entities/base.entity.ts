import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Columnas que comparten todas las tablas: identificador y fechas de auditoría. */
export abstract class EntidadBase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
