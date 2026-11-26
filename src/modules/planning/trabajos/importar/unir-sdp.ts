import type { FilaSdp } from './lector-sdp.js';
import { palabras } from './lector-sdp.js';

/** Un trabajo armado con lo que dicen las distintas hojas sobre él. */
export interface Grupo {
  base: FilaSdp;
  ejecutado: FilaSdp | null;
  control: FilaSdp | null;
  /** Dudas: el trabajo queda marcado «Revisar». */
  avisos: string[];
  /** Datos útiles que no son dudas: van a los comentarios. */
  notas: string[];
}

const parecido = (a: number, b: number) =>
  Math.abs(a - b) <= Math.max(a, b) * 0.015;

/** Qué tan seguro es que dos filas sean el mismo trabajo (mismo sitio ya comprobado). */
export function puntaje(a: FilaSdp, b: FilaSdp): number {
  const montos = a.montos.some((x) => b.montos.some((y) => parecido(x, y)))
    ? 2
    : 0;
  const pa = palabras(a.descripcion);
  const pb = palabras(b.descripcion);
  const comunes = [...pa].filter((p) => pb.has(p)).length;
  const union = new Set([...pa, ...pb]).size;
  return montos + (union ? (2 * comunes) / union : 0);
}

/**
 * Une las hojas de un año. Base: los presupuestos (PPT). A cada uno se le busca su fila de
 * ejecutados y de control con el mismo sitio y monto o descripción parecidos. Lo que no
 * encuentra pareja entra como trabajo aparte, con aviso para revisar.
 */
export function unir(
  ppt: FilaSdp[],
  ejecutados: FilaSdp[],
  control: FilaSdp[],
): { grupos: Grupo[]; sueltos: FilaSdp[] } {
  const grupos: Grupo[] = ppt.map((base) => ({
    base,
    ejecutado: null,
    control: null,
    avisos: [],
    notas: [],
  }));

  /** Lo de control que no encuentra su presupuesto no crea trabajos: solo completa. */
  const sueltos: FilaSdp[] = [];
  const asignar = (
    fila: FilaSdp,
    campo: 'ejecutado' | 'control',
    hojaBase: string,
  ) => {
    const candidatos = grupos.filter(
      (g) => g.base.llave === fila.llave && g[campo] === null,
    );
    const puntuados = candidatos
      .map((g) => ({ g, p: puntaje(g.base, fila) }))
      .sort((a, b) => b.p - a.p);
    const mejor = puntuados[0];
    if (mejor && mejor.p >= 1) {
      mejor.g[campo] = fila;
      return;
    }
    if (mejor && candidatos.length === 1 && mejor.p >= 0.25) {
      mejor.g[campo] = fila;
      mejor.g.avisos.push(
        `Se unió con «${fila.hoja}» fila ${fila.fila} solo por el sitio: revisa que sea el mismo trabajo`,
      );
      return;
    }
    if (campo === 'control') {
      // Solo entra si es un presupuesto de verdad (con descripción y monto); las filas de
      // partidas o continuaciones sin datos no.
      if (fila.montos.length && !fila.descripcion.startsWith('Sin descripción'))
        grupos.push({
          base: fila,
          ejecutado: null,
          control: fila,
          avisos: [],
          notas: [
            'Del Excel: estaba solo en la lista de SDP («CONTROL MTTO CORR 2026»)',
          ],
        });
      else sueltos.push(fila);
      return;
    }
    grupos.push({
      base: fila,
      ejecutado: fila,
      control: null,
      avisos: [],
      notas: [
        `Del Excel: estaba en «${fila.hoja}» pero no su presupuesto en «${hojaBase}»`,
      ],
    });
  };

  const hojaPpt = ppt[0]?.hoja ?? 'PPT SOLICITADOS';
  // Primero lo de SDP (control) y luego lo ejecutado, para que los ejecutados que solo están
  // en control también encuentren pareja.
  for (const c of control) asignar(c, 'control', hojaPpt);
  for (const e of ejecutados) asignar(e, 'ejecutado', hojaPpt);
  return { grupos, sueltos };
}

/** Fechas y estado final del trabajo a partir de lo que dicen todas sus hojas. */
export function armar(g: Grupo) {
  // Sin repetir: si el trabajo nació de control o ejecutados, la base es esa misma fila.
  const filas = [
    ...new Set([g.base, g.control, g.ejecutado].filter((f) => f !== null)),
  ];
  const ppt = g.base.fuente === 'PPT' ? g.base : null;
  const e = g.ejecutado;
  const alguno = (k: keyof FilaSdp) => filas.some((f) => !!f[k]);
  const primero = <K extends keyof FilaSdp>(k: K) =>
    filas.map((f) => f[k]).find((v) => v !== null && v !== '') ?? null;

  const cobrado = alguno('cobrado');
  const facturado = cobrado || alguno('facturado');
  const eaAprobada = facturado || alguno('eaAprobada');
  const eaSolicitada = eaAprobada || alguno('eaSolicitada');
  const ejecutado = eaSolicitada || alguno('ejecutado');
  const enEjecucion = ejecutado || alguno('enEjecucion');
  const conOc = alguno('conOc') || !!e?.ocNumero;
  const aprobado = conOc || enEjecucion || alguno('aprobado');
  const revisado = aprobado || alguno('revisado') || !!ppt?.revisadoEn;

  const anio = g.base.anio;
  // En el Excel la «fecha de envío» a veces es el último envío (posterior a la revisión):
  // el envío toma la fecha más temprana y la revisión la más tardía.
  const min = (...xs: (string | null | undefined)[]) =>
    xs.filter((x): x is string => !!x).sort()[0] ?? null;
  const max = (...xs: (string | null | undefined)[]) =>
    xs
      .filter((x): x is string => !!x)
      .sort()
      .at(-1) ?? null;
  const solicitadoEn =
    min(ppt?.solicitadoEn, ppt?.enviadoEn, ppt?.revisadoEn) ??
    min(e?.ejecutadoEn, e?.facturadoEn) ??
    `${anio}-01-01`;
  const enviadoEn =
    min(ppt?.enviadoEn, ppt?.revisadoEn) ??
    (revisado || ppt === null ? solicitadoEn : null);
  const revisadoEn = revisado
    ? (max(ppt?.revisadoEn, ppt?.enviadoEn) ?? enviadoEn)
    : null;
  const aprobadoEn = aprobado ? (revisadoEn ?? enviadoEn) : null;
  // La ejecución no puede ir antes de la aprobación.
  const ejecutadoEn = ejecutado
    ? (max(e?.ejecutadoEn, aprobadoEn) ?? aprobadoEn)
    : null;
  const facturadoEn = facturado
    ? (e?.facturadoEn ?? ejecutadoEn ?? aprobadoEn)
    : null;

  // Montos: las revisiones del presupuesto y, si el de la OC/ejecución es otro, ese también.
  const revisiones: number[] = [];
  for (const m of [...(ppt?.montos ?? []), ...(g.control?.montos ?? [])])
    if (!revisiones.length || !parecido(revisiones.at(-1)!, m))
      revisiones.push(m);
  const montoFinal = e?.montos[0] ?? null;
  if (montoFinal && !revisiones.some((m) => parecido(m, montoFinal)))
    revisiones.push(montoFinal);
  const monto = montoFinal ?? revisiones.at(-1) ?? null;
  const pct = e?.porcentajeFacturado ?? null;
  const montoFacturado = facturado
    ? (e?.montoFacturado ??
      (monto !== null && pct !== null && pct > 0 && pct < 1
        ? Math.round(monto * pct * 100) / 100
        : monto))
    : null;

  // Cerrado sin terminar solo si no avanzó (un «no aplica» de SDP sobre algo ya facturado no
  // lo cierra). «Anulado» en la hoja de ejecutados sí manda.
  const cancelado =
    e?.cancelado ??
    (!aprobado
      ? (filas.map((f) => f.cancelado).find((c) => c !== null) ?? null)
      : null);

  const comentarios = [...new Set(filas.flatMap((f) => f.comentarios))].filter(
    Boolean,
  );

  return {
    codigo: (e?.codigo.startsWith('PE-') ? e.codigo : null) ?? g.base.codigo,
    nombre: g.base.nombre,
    llave: g.base.llave,
    cliente: primero('cliente') ?? 'SDP',
    descripcion: (ppt ?? g.control ?? g.base).descripcion,
    area: g.base.area,
    criticidad: primero('criticidad'),
    encargado: primero('encargado'),
    monto,
    revisiones,
    solicitadoEn,
    enviadoEn,
    revisadoEn,
    aprobadoEn,
    aprobadoPor: aprobado ? primero('aprobadoPor') : null,
    ocNumero: e?.ocNumero ?? (conOc ? 'S/N' : null),
    ocEn: conOc ? aprobadoEn : null,
    ejecucionInicio: enEjecucion && !ejecutado ? aprobadoEn : null,
    ejecutadoEn,
    eaResponsable: primero('eaResponsable'),
    eaSolicitadaEn: eaSolicitada ? ejecutadoEn : null,
    eaAprobadaEn: eaAprobada ? ejecutadoEn : null,
    facturaNumero: e?.facturaNumero ?? null,
    facturadoEn,
    montoFacturado,
    cobradoEn: cobrado ? (e?.cobradoEn ?? facturadoEn) : null,
    montoCobrado: cobrado ? montoFacturado : null,
    cancelado,
    canceladoEn: cancelado ? (enviadoEn ?? solicitadoEn) : null,
    comentarios: [...g.notas, ...comentarios],
    avisos: g.avisos,
    origen: filas.map((f) => `${f.hoja} fila ${f.fila}`).join(' + '),
    importadoDe: `${g.base.hoja}#${g.base.fila}`,
  };
}
