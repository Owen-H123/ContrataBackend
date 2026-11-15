import { EtapaEvidencia } from '../../../shared/enums/etapa-evidencia.enum.js';
import { TipoEvidencia } from '../evidencias/entities/evidencia.entity.js';
import { calcularProgreso, type RequisitosInforme } from './completitud.js';

const juan = { id: 't1', nombre: 'Juan' };
const pedro = { id: 't2', nombre: 'Pedro' };
const grillete = {
  id: 'i1',
  posicion: 10,
  descripcion: 'CAMBIO DE GRILLETE',
  etapas: [EtapaEvidencia.ANTES, EtapaEvidencia.DESPUES],
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
) => ({ tipo, itemId: null, etapa: null, tecnicoId: null, ...extra });

const completo: RequisitosInforme = {
  tecnicos: [juan, pedro],
  tieneUbicacion: true,
  actividades: [grillete, transporte],
  evidencias: [
    foto(TipoEvidencia.GENERAL),
    foto(TipoEvidencia.EPP, { tecnicoId: 't1' }),
    foto(TipoEvidencia.EPP, { tecnicoId: 't2' }),
    foto(TipoEvidencia.ACTIVIDAD, {
      itemId: 'i1',
      etapa: EtapaEvidencia.ANTES,
    }),
    foto(TipoEvidencia.ACTIVIDAD, {
      itemId: 'i1',
      etapa: EtapaEvidencia.DESPUES,
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
      'Faltan fotos generales del sitio',
      'Falta la foto de EPP de los técnicos',
      'Actividad 10 (CAMBIO DE GRILLETE): falta la foto de antes',
      'Actividad 10 (CAMBIO DE GRILLETE): falta la foto de después',
    ]);
  });

  it('exige el EPP de cada técnico asignado', () => {
    const p = calcularProgreso({
      ...completo,
      evidencias: completo.evidencias.filter((e) => e.tecnicoId !== 't2'),
    });
    expect(p.faltantes).toEqual(['Falta la foto de EPP de Pedro']);
  });

  it('una actividad sin etapas no pide fotos', () => {
    const p = calcularProgreso({ ...completo, actividades: [transporte] });
    expect(p.completo).toBe(true);
  });

  it('una foto de otra etapa no cuenta', () => {
    const p = calcularProgreso({
      ...completo,
      evidencias: completo.evidencias.filter(
        (e) => e.etapa !== EtapaEvidencia.DESPUES,
      ),
    });
    expect(p.faltantes).toEqual([
      'Actividad 10 (CAMBIO DE GRILLETE): falta la foto de después',
    ]);
    expect(p.porcentaje).toBe(85);
  });
});
