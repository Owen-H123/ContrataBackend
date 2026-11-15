import type { EtapaEvidencia } from '../../../shared/enums/etapa-evidencia.enum.js';
import { TipoEvidencia } from '../evidencias/entities/evidencia.entity.js';

export interface RequisitosInforme {
  tecnicos: { id: string; nombre: string }[];
  tieneUbicacion: boolean;
  actividades: {
    id: string;
    posicion: number;
    descripcion: string;
    etapas: EtapaEvidencia[];
  }[];
  /** Solo fotos confirmadas y visibles. */
  evidencias: {
    tipo: TipoEvidencia;
    itemId: string | null;
    etapa: EtapaEvidencia | null;
    tecnicoId: string | null;
  }[];
}

export interface Progreso {
  completo: boolean;
  /** Requisitos cumplidos sobre el total, de 0 a 100. */
  porcentaje: number;
  /** Qué falta, en palabras, para mostrar al técnico. */
  faltantes: string[];
}

const NOMBRE_ETAPA: Record<EtapaEvidencia, string> = {
  ANTES: 'antes',
  PROCESO: 'proceso',
  DESPUES: 'después',
};

/**
 * Qué le falta al informe para poder enviarse:
 * - al menos un técnico asignado;
 * - la ubicación tomada en campo;
 * - al menos una foto general del sitio;
 * - una foto de EPP de cada técnico asignado (no negociable);
 * - una foto por cada etapa que exige cada actividad.
 */
export function calcularProgreso(r: RequisitosInforme): Progreso {
  const faltantes: string[] = [];
  let total = 0;
  const exigir = (cumple: boolean, falta: string) => {
    total += 1;
    if (!cumple) faltantes.push(falta);
  };

  exigir(r.tecnicos.length > 0, 'Asigna al menos un técnico');
  exigir(r.tieneUbicacion, 'Falta registrar la ubicación del sitio');
  exigir(
    r.evidencias.some((e) => e.tipo === TipoEvidencia.GENERAL),
    'Faltan fotos generales del sitio',
  );

  const conEpp = new Set(
    r.evidencias
      .filter((e) => e.tipo === TipoEvidencia.EPP)
      .map((e) => e.tecnicoId),
  );
  if (r.tecnicos.length === 0) {
    exigir(conEpp.size > 0, 'Falta la foto de EPP de los técnicos');
  }
  for (const tecnico of r.tecnicos) {
    exigir(conEpp.has(tecnico.id), `Falta la foto de EPP de ${tecnico.nombre}`);
  }

  const etapasConFoto = new Set(
    r.evidencias
      .filter((e) => e.tipo === TipoEvidencia.ACTIVIDAD)
      .map((e) => `${e.itemId}:${e.etapa}`),
  );
  for (const actividad of r.actividades) {
    for (const etapa of actividad.etapas) {
      exigir(
        etapasConFoto.has(`${actividad.id}:${etapa}`),
        `Actividad ${actividad.posicion} (${actividad.descripcion}): falta la foto de ${NOMBRE_ETAPA[etapa]}`,
      );
    }
  }

  return {
    completo: faltantes.length === 0,
    porcentaje: Math.floor(((total - faltantes.length) / total) * 100),
    faltantes,
  };
}
