/** Momentos de cada trabajo que se documentan con fotos. */
export enum EtapaEvidencia {
  ANTES = 'ANTES',
  DURANTE = 'DURANTE',
  FINALIZADO = 'FINALIZADO',
}

/** Orden en que se muestran y se exigen las etapas. */
export const ETAPAS_EN_ORDEN = [
  EtapaEvidencia.ANTES,
  EtapaEvidencia.DURANTE,
  EtapaEvidencia.FINALIZADO,
] as const;
