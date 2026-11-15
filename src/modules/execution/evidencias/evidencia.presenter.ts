import type { EtapaEvidencia } from '../../../shared/enums/etapa-evidencia.enum.js';
import type { Evidencia, TipoEvidencia } from './entities/evidencia.entity.js';

/** Cómo se entrega una foto al frontend. Nunca expone la clave interna de R2. */
export interface EvidenciaDto {
  id: string;
  tipo: TipoEvidencia;
  itemId: string | null;
  etapa: EtapaEvidencia | null;
  tecnico: { id: string; nombre: string } | null;
  nombreArchivo: string;
  tipoContenido: string;
  bytes: number | null;
  comentario: string | null;
  tomadaEn: Date | null;
  subidaEn: Date;
  subidoPor: { id: string; nombre: string } | null;
  /** Enlace firmado para ver la foto (60 min); null si R2 no está configurado. */
  url: string | null;
}

/** Requiere las relaciones `tecnico` y `subidoPor` cargadas para mostrar los nombres. */
export function presentarEvidencia(
  e: Evidencia,
  url: string | null,
): EvidenciaDto {
  return {
    id: e.id,
    tipo: e.tipo,
    itemId: e.itemId,
    etapa: e.etapa,
    tecnico: e.tecnico ? { id: e.tecnico.id, nombre: e.tecnico.nombre } : null,
    nombreArchivo: e.nombreArchivo,
    tipoContenido: e.tipoContenido,
    bytes: e.bytes,
    comentario: e.comentario,
    tomadaEn: e.tomadaEn,
    subidaEn: e.creadoEn,
    subidoPor: e.subidoPor
      ? { id: e.subidoPor.id, nombre: e.subidoPor.nombre }
      : null,
    url,
  };
}
