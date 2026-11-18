import type { EtapaEvidencia } from '../../../shared/enums/etapa-evidencia.enum.js';
import { TipoEvidencia } from '../evidencias/entities/evidencia.entity.js';

/** Fotos mínimas que se exigen al llegar a la estación. */
export const MINIMO = {
  PANORAMICAS: 2,
  ESTACIONES: 2,
  EPP: 2,
} as const;

/** Tope de fotos visibles de EPP; panorámicas, estaciones e ítems no tienen tope. */
export const MAXIMO_FOTOS = 5;

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
  DURANTE: 'durante',
  FINALIZADO: 'finalizado',
};

/**
 * Qué le falta al informe para poder finalizar la ejecución:
 * - al menos un técnico asignado;
 * - la ubicación del sitio;
 * - 2 fotos panorámicas de la torre completa y 2 de las estaciones y equipos;
 * - 2 fotos de EPP;
 * - al menos una foto por cada etapa que exige cada actividad.
 *
 * Subir más fotos de las mínimas siempre está bien: luego se descartan las que sobran.
 */
export function calcularProgreso(r: RequisitosInforme): Progreso {
  const faltantes: string[] = [];
  let total = 0;
  const exigir = (cumple: boolean, falta: string) => {
    total += 1;
    if (!cumple) faltantes.push(falta);
  };
  const cuantas = (tipo: TipoEvidencia) =>
    r.evidencias.filter((e) => e.tipo === tipo).length;

  exigir(r.tecnicos.length > 0, 'Asigna al menos un técnico');
  exigir(r.tieneUbicacion, 'Falta registrar la ubicación del sitio');

  const grupos: [TipoEvidencia, number, string, string][] = [
    [
      TipoEvidencia.PANORAMICA,
      MINIMO.PANORAMICAS,
      'panorámica de la torre completa',
      'panorámicas de la torre completa',
    ],
    [
      TipoEvidencia.ESTACION,
      MINIMO.ESTACIONES,
      'de las estaciones y equipos',
      'de las estaciones y equipos',
    ],
    [TipoEvidencia.EPP, MINIMO.EPP, 'de EPP', 'de EPP'],
  ];
  for (const [tipo, minimo, singular, plural] of grupos) {
    const faltan = minimo - cuantas(tipo);
    exigir(
      faltan <= 0,
      faltan === 1
        ? `Falta 1 foto ${singular}`
        : `Faltan ${faltan} fotos ${plural}`,
    );
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
