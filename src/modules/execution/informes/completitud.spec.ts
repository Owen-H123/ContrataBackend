import { EtapaEvidencia } from '../../../shared/enums/etapa-evidencia.enum.js';
import { TipoEvidencia } from '../evidencias/entities/evidencia.entity.js';
import { calcularProgreso, type RequisitosInforme } from './completitud.js';

const juan = { id: 't1', nombre: 'Juan' };
const grillete = {
  id: 'i1',
  posicion: 10,
  descripcion: 'CAMBIO DE GRILLETE',
  etapas: [EtapaEvidencia.ANTES, EtapaEvidencia.FINALIZADO],
};
const transporte = {
  id: 'i2',
  posicion: 20,
  descripcion: 'TRANSPORTE',
  etapas: [],
};

const foto = (
  tipo: TipoEvidencia,
  extra: Partial<RequisitosInforme['evidencias'][number]> = {},
) => ({ tipo, itemId: null, etapa: null, ...extra });
const veces = <T>(n: number, f: () => T) => Array.from({ length: n }, f);

const completo: RequisitosInforme = {
  tecnicos: [juan],
  tieneUbicacion: true,
  actividades: [grillete, transporte],
  evidencias: [
    ...veces(2, () => foto(TipoEvidencia.PANORAMICA)),
    ...veces(2, () => foto(TipoEvidencia.ESTACION)),
    ...veces(2, () => foto(TipoEvidencia.EPP)),
    foto(TipoEvidencia.ACTIVIDAD, {
      itemId: 'i1',
      etapa: EtapaEvidencia.ANTES,
    }),
    foto(TipoEvidencia.ACTIVIDAD, {
      itemId: 'i1',
      etapa: EtapaEvidencia.FINALIZADO,
    }),
  ],
};

describe('calcularProgreso', () => {
  it('un informe con todo está completo al 100 %', () => {
    expect(calcularProgreso(completo)).toEqual({
      completo: true,
      porcentaje: 100,
      faltantes: [],
    });
  });

  it('un informe vacío lista todo lo que falta', () => {
    const p = calcularProgreso({
      tecnicos: [],
      tieneUbicacion: false,
      actividades: [grillete],
      evidencias: [],
    });
    expect(p.completo).toBe(false);
    expect(p.porcentaje).toBe(0);
    expect(p.faltantes).toEqual([
      'Asigna al menos un técnico',
      'Falta registrar la ubicación del sitio',
      'Faltan 2 fotos panorámicas de la torre completa',
      'Faltan 2 fotos de las estaciones y equipos',
      'Faltan 2 fotos de EPP',
      'Actividad 10 (CAMBIO DE GRILLETE): falta la foto de antes',
      'Actividad 10 (CAMBIO DE GRILLETE): falta la foto de finalizado',
    ]);
  });

  it('una foto que falta se dice en singular', () => {
    const p = calcularProgreso({
      ...completo,
      evidencias: completo.evidencias.filter(
        (e, i) => !(e.tipo === TipoEvidencia.EPP && i === 5),
      ),
    });
    expect(p.faltantes).toEqual(['Falta 1 foto de EPP']);
  });

  it('el EPP son 2 fotos en total, sin importar cuántos técnicos haya', () => {
    const dos = {
      ...completo,
      tecnicos: [juan, { id: 't2', nombre: 'Pedro' }],
    };
    expect(calcularProgreso(dos).completo).toBe(true);
  });

  it('subir más fotos de las mínimas no estorba', () => {
    const p = calcularProgreso({
      ...completo,
      evidencias: [
        ...completo.evidencias,
        ...veces(5, () => foto(TipoEvidencia.PANORAMICA)),
      ],
    });
    expect(p.completo).toBe(true);
  });

  it('una actividad sin etapas no pide fotos', () => {
    const p = calcularProgreso({ ...completo, actividades: [transporte] });
    expect(p.completo).toBe(true);
  });

  it('una foto de otra etapa no cuenta', () => {
    const p = calcularProgreso({
      ...completo,
      evidencias: completo.evidencias.filter(
        (e) => e.etapa !== EtapaEvidencia.FINALIZADO,
      ),
    });
    expect(p.faltantes).toEqual([
      'Actividad 10 (CAMBIO DE GRILLETE): falta la foto de finalizado',
    ]);
  });
});
