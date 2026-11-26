import { describe, expect, it } from 'vitest';
import {
  type FilaSdp,
  juntarAvances,
  llaveSitio,
  numero,
} from './lector-sdp.js';
import { armar, unir } from './unir-sdp.js';

const fila = (p: Partial<FilaSdp>): FilaSdp =>
  ({
    hoja: 'PPT SOLICITADOS 2025',
    fila: 1,
    fuente: 'PPT',
    anio: 2025,
    codigo: 'LI0753',
    nombre: 'CANTUARIAS',
    llave: 'LI753',
    cliente: 'SDP',
    descripcion: 'CARTA DE SEGURIDAD ESTRUCTURAL',
    area: 'CORRECTIVO',
    criticidad: null,
    encargado: null,
    montos: [],
    solicitadoEn: '2025-01-06',
    enviadoEn: '2025-01-06',
    revisadoEn: null,
    revisado: false,
    aprobado: false,
    aprobadoPor: null,
    conOc: false,
    ocNumero: null,
    enEjecucion: false,
    ejecutado: false,
    ejecutadoEn: null,
    eaResponsable: null,
    eaSolicitada: false,
    eaAprobada: false,
    facturado: false,
    facturadoEn: null,
    facturaNumero: null,
    porcentajeFacturado: null,
    montoFacturado: null,
    cobrado: false,
    cobradoEn: null,
    cancelado: null,
    comentarios: [],
    ...p,
  }) as FilaSdp;

describe('llaveSitio', () => {
  it('une el código viejo y el nuevo de SDP', () => {
    expect(llaveSitio('LI0753', '')).toBe('LI753');
    expect(llaveSitio('PE-01-LI-00753-10', '')).toBe('LI753');
    expect(llaveSitio('pe-04-ar-04016-13', '')).toBe('AR4016');
  });
  it('sin código usa el nombre', () => {
    expect(llaveSitio('', 'Factibilidad 1')).toBe('N:FACTIBILIDAD1');
  });
});

describe('numero', () => {
  it('lee montos en sus distintos formatos', () => {
    expect(numero('S/.5.400,00')).toBe(5400);
    expect(numero('12,097.52')).toBe(12097.52);
    expect(numero('3381.11')).toBe(3381.11);
    expect(numero('PENDIENTE')).toBeNull();
    expect(numero('-')).toBeNull();
  });
});

describe('juntarAvances', () => {
  it('«REVISADO / …» y «APROBADO / …» son revisiones del mismo presupuesto', () => {
    const quedan = juntarAvances([
      fila({
        fila: 73,
        descripcion: 'SELLADO DE COBERTURAS-IMPERMEABILIZACION',
        montos: [6551.79],
      }),
      fila({
        fila: 84,
        descripcion: 'REVISADO / SELLADO DE COBERTURAS-IMPERMEABILIZACION',
        montos: [6583.23],
      }),
      fila({
        fila: 116,
        descripcion: 'APROBADO / SELLADO DE COBERTURAS-IMPERMEABILIZACION',
        montos: [6483.23],
      }),
    ]);
    expect(quedan).toHaveLength(1);
    expect(quedan[0].montos).toEqual([6551.79, 6583.23, 6483.23]);
    expect(quedan[0].aprobado).toBe(true);
  });
});

describe('unir y armar', () => {
  it('une el presupuesto con su ejecución por sitio y monto, y calcula los pasos', () => {
    const ppt = [fila({ montos: [1200, 1000] })];
    const ejec = [
      fila({
        hoja: 'CORRECTIVOS EJECUTADOS 2026',
        fuente: 'EJECUTADO',
        codigo: 'PE-01-LI-00753-10',
        descripcion: 'CARTA DE SEGURIDAD',
        montos: [1000],
        ejecutado: true,
        ejecutadoEn: '2025-02-15',
        ocNumero: '4500154389',
        conOc: true,
        facturado: true,
        facturaNumero: 'E001-279',
        facturadoEn: '2025-03-01',
      }),
    ];
    const { grupos } = unir(ppt, ejec, []);
    expect(grupos).toHaveLength(1);
    const t = armar(grupos[0]);
    expect(t.codigo).toBe('PE-01-LI-00753-10');
    expect(t.monto).toBe(1000);
    expect(t.revisiones).toEqual([1200, 1000]);
    expect(t.ocNumero).toBe('4500154389');
    expect(t.facturadoEn).toBe('2025-03-01');
    expect(t.avisos).toHaveLength(0);
  });

  it('lo ejecutado sin presupuesto entra como trabajo aparte, sin marcarlo «Revisar»', () => {
    const { grupos } = unir(
      [],
      [fila({ fuente: 'EJECUTADO', montos: [500] })],
      [],
    );
    expect(grupos).toHaveLength(1);
    const t = armar(grupos[0]);
    expect(t.avisos).toHaveLength(0);
    expect(t.comentarios[0]).toMatch(/no su presupuesto/);
  });
});
