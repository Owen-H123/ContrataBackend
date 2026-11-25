import ExcelJS from 'exceljs';

/**
 * Lee el Excel «CORRECTIVO CONTROL SDP» y devuelve cada fila ya traducida a hitos con fecha.
 * No toca la base de datos: eso lo hace el importador.
 *
 * Hojas que se usan:
 * - PPT SOLICITADOS 2025 / 2026 → presupuestos (fechas, montos y revisiones).
 * - CORRECTIVOS 2025 / CORRECTIVOS EJECUTADOS 2026 → ejecución, OC, acta, factura y pago.
 * - CONTROL MTTO CORR 2026 → lo que respondió SDP (revisado, aprobado, OC emitida…).
 */

export type Fuente = 'PPT' | 'EJECUTADO' | 'CONTROL';

export interface FilaSdp {
  hoja: string;
  fila: number;
  fuente: Fuente;
  anio: number;
  codigo: string;
  nombre: string;
  /** Llave del sitio para unir hojas: «LI753» vale para LI0753 y PE-01-LI-00753-10. */
  llave: string;
  cliente: string;
  descripcion: string;
  area: 'CORRECTIVO' | 'PREVENTIVO';
  criticidad: 'CRITICO' | 'NO_CRITICO' | null;
  encargado: string | null;
  /** Monto inicial y cada revisión, en orden. */
  montos: number[];
  solicitadoEn: string | null;
  enviadoEn: string | null;
  revisadoEn: string | null;
  /** Cuando el Excel dice que se llegó a un paso pero sin fecha, va `true`. */
  revisado: boolean;
  aprobado: boolean;
  aprobadoPor: string | null;
  conOc: boolean;
  ocNumero: string | null;
  enEjecucion: boolean;
  ejecutado: boolean;
  /** Mes de ejecución como fecha aproximada (día 15). */
  ejecutadoEn: string | null;
  eaResponsable: string | null;
  eaSolicitada: boolean;
  eaAprobada: boolean;
  facturado: boolean;
  facturadoEn: string | null;
  facturaNumero: string | null;
  /** Parte facturada (1 = todo, 0.8 = 80 %). */
  porcentajeFacturado: number | null;
  montoFacturado: number | null;
  cobrado: boolean;
  cobradoEn: string | null;
  cancelado: 'ANULADO' | 'RECHAZADO' | 'NO_APLICA' | null;
  comentarios: string[];
}

const MESES = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SETIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];

/** Texto de una celda, sea texto enriquecido, fórmula, fecha o número. */
function texto(c: ExcelJS.Cell): string {
  const v = c.value as unknown;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as {
      richText?: { text: string }[];
      result?: unknown;
      text?: string;
    };
    if (o.richText)
      return o.richText
        .map((x) => x.text)
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
    if ('result' in o) {
      const r = o.result;
      if (r instanceof Date) return r.toISOString().slice(0, 10);
      return r === undefined || r === null ? '' : String(r).trim();
    }
    if (o.text) return o.text.trim();
    return '';
  }
  return String(v).replace(/\s+/g, ' ').trim();
}

/** AAAA-MM-DD si la celda es una fecha; si no, null. */
function fecha(c: ExcelJS.Cell): string | null {
  const t = texto(c);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (!m) return null;
  const anio = Number(m[1]);
  return anio >= 2020 && anio <= 2030 ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Número de una celda («S/.5.400,00», «12,097.52», 3381.11); null si no es número. */
export function numero(c: ExcelJS.Cell | string): number | null {
  let t = typeof c === 'string' ? c : texto(c);
  t = t.replace(/S\/\.?/gi, '').replace(/\s/g, '');
  if (!t || !/\d/.test(t)) return null;
  // «5.400,00» (punto de miles y coma decimal)
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(t))
    t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Llave del sitio. SDP cambió de códigos (LI0753 → PE-01-LI-00753-10); la llave es la parte
 * que comparten: letras de la región + número sin ceros.
 */
export function llaveSitio(codigo: string, nombre: string): string {
  const c = codigo.toUpperCase().replace(/\s/g, '');
  const nuevo = /^PE-\d{2}-([A-Z]{2})-(\d{4,6})/.exec(c);
  if (nuevo) return `${nuevo[1]}${Number(nuevo[2])}`;
  const viejo = /^([A-Z]{2,3})[-_]?(\d{3,6})$/.exec(c);
  if (viejo) return `${viejo[1]}${Number(viejo[2])}`;
  return `N:${sinTildes(nombre)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')}`;
}

/** Palabras con sentido de una descripción (para comparar dos descripciones). */
export function palabras(s: string): Set<string> {
  return new Set(
    sinTildes(s)
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((p) => p.length >= 4),
  );
}

const esMes = (t: string) => MESES.includes(sinTildes(t).toUpperCase().trim());
const mesAFecha = (t: string, anio: number) => {
  const i = MESES.indexOf(sinTildes(t).toUpperCase().trim());
  return i < 0 ? null : `${anio}-${String(i + 1).padStart(2, '0')}-15`;
};

function vacia(base: Partial<FilaSdp>): FilaSdp {
  return {
    hoja: '',
    fila: 0,
    fuente: 'PPT',
    anio: 2026,
    codigo: '',
    nombre: '',
    llave: '',
    cliente: 'SDP',
    descripcion: '',
    area: 'CORRECTIVO',
    criticidad: null,
    encargado: null,
    montos: [],
    solicitadoEn: null,
    enviadoEn: null,
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
    ...base,
  };
}

/** Número de OC si parece uno (4500154389, 2025-0170, 5349). */
const ocDe = (t: string) =>
  /^[0-9][0-9-]{2,19}$/.test(t.replace(/\s/g, ''))
    ? t.replace(/\s/g, '')
    : null;
/** Número de factura «E001-279», «E001 - 333», «E00-310». */
const facturaDe = (t: string) => {
  const m = /E\s*0*0?1?\s*-\s*(\d+)/i.exec(t);
  return m ? `E001-${m[1]}` : null;
};
const nombrePersona = (t: string) =>
  t && !/FACTURADO|NO EJECUTADO|PENDIENTE|OK|NOK/i.test(t)
    ? t.replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 60)
    : null;

/** Base común de cada fila: sitio, cliente y descripción. Null si la fila no es un trabajo. */
function base(
  hoja: string,
  fila: number,
  fuente: Fuente,
  anio: number,
  codigo: string,
  nombre: string,
  descripcion: string,
  cliente: string,
): FilaSdp | null {
  codigo = codigo.trim();
  nombre = nombre.replace(/^REV\.?\s+/i, '').trim();
  // Filas separadoras («ENERO» en todas las columnas) o vacías.
  if (!nombre || esMes(nombre) || esMes(codigo)) return null;
  if (!descripcion && !codigo) return null;
  return vacia({
    hoja,
    fila,
    fuente,
    anio,
    codigo: codigo.toUpperCase().slice(0, 40),
    nombre: nombre.toUpperCase().slice(0, 120),
    llave: llaveSitio(codigo, nombre),
    cliente: (cliente || 'SDP').toUpperCase().trim(),
    descripcion: (descripcion || 'Sin descripción en el Excel').slice(0, 500),
  });
}

function pptSolicitados2026(h: ExcelJS.Worksheet): FilaSdp[] {
  const filas: FilaSdp[] = [];
  h.eachRow((r, n) => {
    if (n < 2) return;
    const c = (i: number) => r.getCell(i);
    const f = base(
      h.name,
      n,
      'PPT',
      2026,
      texto(c(1)),
      texto(c(2)),
      texto(c(3)),
      texto(c(6)),
    );
    if (!f) return;
    const tipo = texto(c(4)).toUpperCase();
    f.area = tipo === 'MP' ? 'PREVENTIVO' : 'CORRECTIVO';
    const estado = texto(c(5)).toUpperCase();
    if (estado === 'CRITICO') f.criticidad = 'CRITICO';
    if (estado === 'NO CRITICO') f.criticidad = 'NO_CRITICO';
    if (estado === 'NO APLICA') f.cancelado = 'NO_APLICA';
    if (estado === 'NO HAY ACCESO')
      f.comentarios.push('No hay acceso al sitio');
    f.encargado = nombrePersona(texto(c(7)));
    f.montos = [8, 9, 10, 11, 12]
      .map((i) => numero(c(i)))
      .filter((x): x is number => x !== null);
    f.enviadoEn = estado === 'NO ENVIADO' ? null : fecha(c(17));
    f.solicitadoEn =
      fecha(c(17)) ??
      mesAFecha(texto(c(19)), 2026)?.replace(/15$/, '01') ??
      null;
    f.revisadoEn = fecha(c(18));
    const aprobado = texto(c(13)).toUpperCase();
    if (/APROBADO|GENERACION OC/.test(aprobado)) f.aprobado = true;
    if (/EJECUTADO/.test(aprobado)) f.ejecutado = true;
    const comentario = texto(c(20));
    if (comentario) f.comentarios.push(comentario);
    filas.push(f);
  });
  return filas;
}

function pptSolicitados2025(h: ExcelJS.Worksheet): FilaSdp[] {
  const filas: FilaSdp[] = [];
  h.eachRow((r, n) => {
    if (n < 2) return;
    const c = (i: number) => r.getCell(i);
    const f = base(
      h.name,
      n,
      'PPT',
      2025,
      texto(c(1)),
      texto(c(2)),
      texto(c(3)),
      texto(c(5)),
    );
    if (!f) return;
    const monto = numero(c(6));
    // «REV. UNASAM_HUARAZ»: es otra versión del presupuesto de arriba, no otro trabajo.
    if (/^REV\.?\s/i.test(texto(c(2)))) {
      const original = filas.findLast((x) => x.llave === f.llave);
      if (original) {
        if (monto) original.montos.push(monto);
        original.revisado = true;
        return;
      }
    }
    if (monto) f.montos = [monto];
    f.solicitadoEn = fecha(c(11));
    f.enviadoEn = fecha(c(12));
    if (!f.solicitadoEn)
      f.solicitadoEn =
        f.enviadoEn ??
        mesAFecha(texto(c(13)), 2025)?.replace(/15$/, '01') ??
        null;
    const visita = texto(c(7)).toUpperCase();
    if (visita === 'SIN VISITA' || visita === 'NO VISITADO')
      f.comentarios.push(`Visita: ${visita.toLowerCase()}`);
    const compras = texto(c(8)).toUpperCase();
    if (compras === 'APROBADO') f.aprobado = true;
    if (
      compras === 'REVISADO' ||
      compras === 'CONTRAOFERTA' ||
      compras === 'MODIFICACION'
    )
      f.revisado = true;
    if (compras === 'CONTRAOFERTA')
      f.comentarios.push('El cliente hizo contraoferta');
    if (compras === 'NO APROBADO') f.cancelado = 'RECHAZADO';
    const oc = texto(c(9)).toUpperCase();
    if (oc === 'CON OC' || oc === 'OC') {
      f.conOc = true;
      f.aprobado = true;
    }
    const ejec = texto(c(10)).toUpperCase();
    if (ejec === 'EJECUTADO') f.ejecutado = true;
    if (ejec === 'EN PROCESO') f.enEjecucion = true;
    filas.push(f);
  });
  return filas;
}

function ejecutados2026(h: ExcelJS.Worksheet): FilaSdp[] {
  const filas: FilaSdp[] = [];
  h.eachRow((r, n) => {
    if (n < 2) return;
    const c = (i: number) => r.getCell(i);
    const f = base(
      h.name,
      n,
      'EJECUTADO',
      2026,
      texto(c(1)),
      texto(c(2)),
      texto(c(3)),
      texto(c(8)),
    );
    if (!f) return;
    const obra = texto(c(4)).toUpperCase();
    const mes = texto(c(5));
    const monto = numero(c(6));
    if (monto) f.montos = [monto];
    f.aprobado = true;
    if (obra === 'EJECUTADO' || obra === 'VALIDADO') {
      f.ejecutado = true;
      f.ejecutadoEn = mesAFecha(mes, 2026);
    }
    if (obra === 'EN PROCESO') f.enEjecucion = true;
    if (obra === 'NO EJECUTADO') f.cancelado = 'ANULADO';
    const ea = texto(c(7));
    if (/FACTURADO/i.test(ea)) f.eaAprobada = true;
    else f.eaResponsable = nombrePersona(ea);
    const oc = ocDe(texto(c(9)));
    if (oc) {
      f.conOc = true;
      f.ocNumero = oc.slice(0, 20);
    }
    const estado = texto(c(10)).toUpperCase();
    if (estado === 'FACTURADO') {
      f.facturado = true;
      f.eaAprobada = true;
    }
    const pendienteEa = /PENDIENTE\s*-?\s*EA\s*-?\s*(.*)/.exec(estado);
    if (pendienteEa) {
      f.eaSolicitada = true;
      f.eaResponsable ??= nombrePersona(pendienteEa[1]);
    }
    if (/PENDIENTE DE EMISION OC|SOLPED/.test(estado)) f.conOc = false;
    if (estado === 'ANULADO' || estado === 'NO SE EJECUTO')
      f.cancelado = 'ANULADO';
    f.facturadoEn = fecha(c(12));
    const factura = texto(c(13));
    f.facturaNumero = facturaDe(factura);
    if (f.facturaNumero || f.facturadoEn) f.facturado = true;
    if (/ANULADO/i.test(factura)) f.cancelado = 'ANULADO';
    if (/FALTA FACTURAR|%/i.test(factura)) f.comentarios.push(factura);
    f.montoFacturado = numero(c(14));
    const pct = numero(c(15));
    f.porcentajeFacturado = pct === null ? null : pct > 1 ? pct / 100 : pct;
    if (mes && !esMes(mes) && !/^\d{4}$/.test(mes))
      f.comentarios.push(`Ejecutó: ${mes}`);
    filas.push(f);
  });
  return filas;
}

function correctivos2025(h: ExcelJS.Worksheet): FilaSdp[] {
  const filas: FilaSdp[] = [];
  h.eachRow((r, n) => {
    if (n < 2) return;
    const c = (i: number) => r.getCell(i);
    const f = base(
      h.name,
      n,
      'EJECUTADO',
      2025,
      texto(c(1)),
      texto(c(2)),
      texto(c(3)),
      texto(c(7)),
    );
    if (!f) return;
    const obra = texto(c(4)).toUpperCase();
    const monto = numero(c(5));
    if (monto) f.montos = [monto];
    f.aprobado = true;
    if (obra === 'EJECUTADO' || obra === 'OK') {
      f.ejecutado = true;
      f.ejecutadoEn = mesAFecha(texto(c(14)), 2025);
    }
    if (obra === 'PARALIZADO') {
      f.enEjecucion = true;
      f.comentarios.push('Paralizado');
    }
    const ea = texto(c(6)).toUpperCase();
    if (ea === 'OK') f.eaAprobada = true;
    if (ea === 'PENDIENTE') f.eaSolicitada = true;
    if (/ANULAR/.test(ea)) f.comentarios.push(texto(c(6)));
    const oc = ocDe(texto(c(8)));
    if (oc) {
      f.conOc = true;
      f.ocNumero = oc.slice(0, 20);
    } else if (/DIRECTO/i.test(texto(c(8))))
      f.comentarios.push('Trabajo directo, sin OC');
    const facturado = texto(c(9)).toUpperCase();
    if (facturado === 'FACTURADO') f.facturado = true;
    f.facturadoEn = fecha(c(9));
    if (f.facturadoEn) f.facturado = true;
    const pago = texto(c(10)).toUpperCase();
    const factura = texto(c(11));
    f.facturaNumero = facturaDe(factura);
    if (f.facturaNumero) f.facturado = true;
    // En el Perú «cancelado» = pagado por completo.
    f.cobradoEn = fecha(c(13)) ?? fecha(c(10));
    if (pago === 'PAGADO' || /CANCELADO/i.test(factura) || f.cobradoEn) {
      f.cobrado = true;
      f.facturado = true;
    }
    const parte = numero(c(12));
    if (parte && parte < 1) f.porcentajeFacturado = parte;
    else if (parte && parte > 1)
      f.comentarios.push(`Pago parcial: S/ ${parte}`);
    filas.push(f);
  });
  return filas;
}

function controlMtto2026(h: ExcelJS.Worksheet): FilaSdp[] {
  const filas: FilaSdp[] = [];
  h.eachRow((r, n) => {
    if (n < 4) return;
    const c = (i: number) => r.getCell(i);
    const f = base(
      h.name,
      n,
      'CONTROL',
      2026,
      texto(c(1)),
      texto(c(2)),
      texto(c(3)),
      'SDP',
    );
    if (!f) return;
    const monto = numero(c(4));
    if (monto) f.montos = [monto];
    const crit = texto(c(7)).toUpperCase();
    if (crit === 'CRITICO') f.criticidad = 'CRITICO';
    if (crit === 'NO CRITICO') f.criticidad = 'NO_CRITICO';
    if (/^REVISADO/i.test(texto(c(8)))) f.revisado = true;
    const aprob = texto(c(9));
    if (/^APROBADO/i.test(aprob)) {
      f.aprobado = true;
      f.revisado = true;
      f.aprobadoPor = /LATAM/i.test(aprob) ? 'LATAM' : 'SDP PERÚ';
    }
    if (/^NO APLICA/i.test(aprob) && /^NO APLICA/i.test(texto(c(10))))
      f.cancelado = 'NO_APLICA';
    if (/OC EMITIDA/i.test(texto(c(10)))) f.conOc = true;
    const ejec = texto(c(11)).toUpperCase();
    if (ejec === 'FACTURADO') {
      f.facturado = true;
      f.ejecutado = true;
      f.eaAprobada = true;
    }
    if (ejec === 'PROCESO EA') {
      f.ejecutado = true;
      f.eaSolicitada = true;
    }
    if (ejec === 'EJECUTADO') f.ejecutado = true;
    if (ejec === 'EN PROCESO') f.enEjecucion = true;
    const comentario = texto(c(12));
    if (comentario) f.comentarios.push(comentario);
    filas.push(f);
  });
  return filas;
}

export async function leerSdp(archivo: string) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(archivo);
  const hoja = (nombre: string) => {
    const h = libro.worksheets.find(
      (w) => w.name.trim().toUpperCase() === nombre,
    );
    if (!h) throw new Error(`No encuentro la hoja «${nombre}» en el Excel`);
    return h;
  };
  return {
    2025: {
      ppt: pptSolicitados2025(hoja('PPT SOLICITADOS 2025')),
      ejecutados: correctivos2025(hoja('CORRECTIVOS 2025')),
      control: [] as FilaSdp[],
    },
    2026: {
      ppt: pptSolicitados2026(hoja('PPT SOLICITADOS 2026')),
      ejecutados: ejecutados2026(hoja('CORRECTIVOS EJECUTADOS 2026')),
      control: controlMtto2026(hoja('CONTROL MTTO CORR 2026')),
    },
  };
}

/** «REVISADO / SELLADO…», «APROBADO / …», «LIQUIDACION / …», «REV01. …»: avance de un presupuesto anterior. */
const AVANCE = /^(REVISADO|APROBADO|LIQUIDACION|REV\s*0?\d*\.?)\s*[/:.-]\s*/i;

/**
 * En «PPT SOLICITADOS» cada avance de un presupuesto se anotaba como otra fila. Las junta con
 * su presupuesto original (mismo sitio, descripción parecida, fila anterior): suma el monto como
 * revisión y marca el avance. Lo que no encuentra a su original queda como está.
 */
export function juntarAvances(filas: FilaSdp[]): FilaSdp[] {
  const quedan: FilaSdp[] = [];
  for (const f of filas) {
    const m = AVANCE.exec(f.descripcion);
    if (m) {
      const resto = palabras(f.descripcion.slice(m[0].length));
      const original = quedan.findLast((o) => {
        if (o.llave !== f.llave) return false;
        const p = palabras(o.descripcion.replace(AVANCE, ''));
        const comunes = [...resto].filter((x) => p.has(x)).length;
        return comunes / Math.max(1, Math.min(resto.size, p.size)) >= 0.5;
      });
      if (original) {
        original.montos.push(...f.montos);
        original.revisado = true;
        original.revisadoEn =
          f.enviadoEn ?? f.revisadoEn ?? original.revisadoEn;
        const tipo = m[1].toUpperCase();
        if (tipo === 'APROBADO') original.aprobado = true;
        if (tipo === 'LIQUIDACION') {
          original.aprobado = true;
          original.comentarios.push('Tiene liquidación');
        }
        original.aprobado ||= f.aprobado;
        original.conOc ||= f.conOc;
        original.ejecutado ||= f.ejecutado;
        original.enEjecucion ||= f.enEjecucion;
        original.comentarios.push(...f.comentarios);
        continue;
      }
    }
    quedan.push(f);
  }
  return quedan;
}
