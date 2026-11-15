/** Momentos del trabajo que se documentan con fotos. */
export enum EtapaEvidencia {
  ANTES = 'ANTES',
  PROCESO = 'PROCESO',
  DESPUES = 'DESPUES',
}

/** Orden en que se muestran y se exigen las etapas. */
export const ETAPAS_EN_ORDEN = [
  EtapaEvidencia.ANTES,
  EtapaEvidencia.PROCESO,
  EtapaEvidencia.DESPUES,
] as const;
