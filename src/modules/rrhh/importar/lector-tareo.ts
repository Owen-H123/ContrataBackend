import ExcelJS from 'exceljs';

/**
 * Lee el Excel «TAREO 2026» que usaba RYSCOM: una hoja por mes y, en cada hoja, un bloque
 * por semana. Cada bloque tiene dos filas de cabecera:
 *
 *   Nº | APELLIDOS Y NOMBRES | DNI | CARGO | D | L | M | M | J | V | S | TOTAL DIAS | PAGO/DIA | …
 *   Nº | APELLIDOS Y NOMBRES | DNI | CARGO | 22| 23| 24| 25| 26| 27| 28| TOTAL DIAS | …
 *
 * Lo que manda es el **número de día** (la letra D/L/M no siempre coincide: algunos bloques van
 * de lunes a domingo). Las columnas se ubican por su título, porque algunas hojas tienen
 * columnas de más (p. ej. TELEFONO en mayo). Después de «TOTAL DIAS» vienen siempre:
 * pago/día, subtotal, abonos, (abono sin título), descuentos, total y comentarios.
 * El total en todas las hojas es TOTAL = SUBTOTAL − DESCUENTOS + ABONOS (aunque en enero la
 * columna de descuentos diga «BONOS», la fórmula la resta).
 */

export interface FilaExcel {
  hoja: string;
  /** Fila de Excel, para poder ubicar errores. */
  fila: number;
  /** Fecha del primer día del bloque (AAAA-MM-DD). */
  inicio: string;
  /** Fechas en que trabajó (AAAA-MM-DD). */
  fechas: string[];
  nombres: string;
  dni: string | null;
  cargo: string | null;
  pagoDia: number;
  abonos: number[];
  descuentos: number[];
  comentario: string | null;
  /** Total que calculaba el Excel (para comparar); null si la celda estaba vacía. */
  totalExcel: number | null;
}

const MESES: Record<string, number> = {
  ENERO: 1,
  FEBRERO: 2,
  MARZO: 3,
  ABRIL: 4,
  MAYO: 5,
  JUNIO: 6,
  JULIO: 7,
  AGOSTO: 8,
  SETIEMBRE: 9,
  SEPTIEMBRE: 9,
  OCTUBRE: 10,
  NOVIEMBRE: 11,
  DICIEMBRE: 12,
};

/** Texto de una celda, sin importar si es texto enriquecido, fórmula o número. */
function texto(c: ExcelJS.Cell): string {
  const v = c.value as unknown;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
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
    if ('result' in o)
      return o.result === undefined || o.result === null
        ? ''
        : String(o.result).trim();
    if (o.text) return o.text.trim();
    return '';
  }
  return String(v).replace(/\s+/g, ' ').trim();
}

/** Número de una celda (valor, resultado de fórmula o texto «1,5»); null si no hay. */
function numero(c: ExcelJS.Cell): number | null {
  const v = c.value as unknown;
  let n: unknown = v;
  if (v && typeof v === 'object' && !(v instanceof Date))
    n = (v as { result?: unknown }).result;
  if (typeof n === 'number') return Number.isFinite(n) ? n : null;
  if (typeof n === 'string' && n.trim() !== '') {
    const x = Number(n.trim().replace(',', '.'));
    return Number.isFinite(x) ? x : null;
  }
  return null;
}

/** Montos de una celda de abonos: «=50+50+50» se separa en tres abonos de 50. */
function montos(c: ExcelJS.Cell): number[] {
  const v = c.value as { formula?: string } | null;
  if (
    v &&
    typeof v === 'object' &&
    typeof v.formula === 'string' &&
    /^[\d.\s+]+$/.test(v.formula)
  ) {
    return v.formula
      .split('+')
      .map((x) => Number(x.trim()))
      .filter((x) => x > 0);
  }
  const n = numero(c);
  return n && n > 0 ? [n] : [];
}

const fechaIso = (d: Date) => d.toISOString().slice(0, 10);
const masDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return fechaIso(d);
};

const esCabecera = (row: ExcelJS.Row) =>
  [2, 3].some((c) =>
    texto(row.getCell(c)).toUpperCase().startsWith('APELLIDOS Y NOMBRES'),
  );

/** Columnas de un bloque, ubicadas por los títulos de su cabecera. */
interface Columnas {
  nombre: number;
  dni: number;
  cargo: number;
  dias: number[];
  pago: number;
  abono: number;
  abono2: number;
  descuento: number;
  total: number;
  comentario: number;
  nota: number;
}

function columnasDe(
  letras: ExcelJS.Row,
  numeros: ExcelJS.Row,
): Columnas | null {
  const titulo = (c: number) => texto(letras.getCell(c)).toUpperCase();
  let nombre = 0;
  let totalDias = 0;
  for (let c = 1; c <= 40; c++) {
    const t = titulo(c);
    if (!nombre && t.startsWith('APELLIDOS')) nombre = c;
    if (!totalDias && t.startsWith('TOTAL DIAS')) totalDias = c;
  }
  if (!nombre || !totalDias) return null;
  // Los 7 días son las 7 columnas justo antes de TOTAL DIAS.
  const dias = Array.from({ length: 7 }, (_, i) => totalDias - 7 + i);
  void numeros;
  return {
    nombre,
    dni: nombre + 1,
    cargo: nombre + 2,
    dias,
    pago: totalDias + 1,
    abono: totalDias + 3,
    abono2: totalDias + 4,
    descuento: totalDias + 5,
    total: totalDias + 6,
    comentario: totalDias + 7,
    nota: totalDias + 8,
  };
}

/**
 * Fecha del primer día del bloque a partir de los números de día escritos. Puede caer en el
 * mes de la hoja o en el anterior (la hoja de setiembre empieza con «30, 31, 1, 2…»): se
 * elige el mes en el que más días escritos caen dentro del mes de la hoja.
 */
function inicioDelBloque(
  anio: number,
  mesHoja: number,
  numeros: (number | null)[],
): string | null {
  const i = numeros.findIndex((n) => n !== null);
  if (i < 0) return null;
  const n = numeros[i]!;
  let mejor: { inicio: string; aciertos: number } | null = null;
  for (const m of [mesHoja, mesHoja - 1, mesHoja + 1]) {
    const d = new Date(Date.UTC(anio, m - 1, n));
    if (d.getUTCDate() !== n) continue; // p. ej. 31 en un mes de 30 días
    const inicio = masDias(fechaIso(d), -i);
    const aciertos = numeros.filter((x, j) => {
      if (x === null) return false;
      const f = new Date(`${masDias(inicio, j)}T12:00:00Z`);
      return f.getUTCDate() === x && f.getUTCMonth() + 1 === mesHoja;
    }).length;
    if (!mejor || aciertos > mejor.aciertos) mejor = { inicio, aciertos };
  }
  return mejor?.inicio ?? null;
}

export interface LecturaTareo {
  filas: FilaExcel[];
  /** Bloques que no se pudieron fechar o filas raras, para revisarlos a mano. */
  avisos: string[];
}

export async function leerTareo(
  archivo: string,
  anio = 2026,
): Promise<LecturaTareo> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(archivo);
  const filas: FilaExcel[] = [];
  const avisos: string[] = [];

  for (const hoja of libro.worksheets) {
    if (hoja.state !== 'visible') continue; // la hoja oculta «agosto 2da semana» es un borrador viejo
    const mes = MESES[hoja.name.trim().toUpperCase()];
    if (!mes) {
      avisos.push(`Hoja «${hoja.name}» ignorada: no es un mes`);
      continue;
    }

    for (let r = 2; r <= hoja.rowCount; r++) {
      const row = hoja.getRow(r);
      // La cabecera con los números de día es la segunda de dos cabeceras seguidas.
      if (!esCabecera(row) || esCabecera(hoja.getRow(r + 1))) continue;
      const letras = esCabecera(hoja.getRow(r - 1)) ? hoja.getRow(r - 1) : row;
      const col = columnasDe(letras, row);
      if (!col) {
        avisos.push(
          `${hoja.name} fila ${r}: no encontré las columnas del bloque`,
        );
        continue;
      }
      const numeros = col.dias.map((c) => {
        const n = numero(row.getCell(c));
        return n !== null && Number.isInteger(n) && n >= 1 && n <= 31
          ? n
          : null;
      });
      const inicio = inicioDelBloque(anio, mes, numeros);

      const leidas: FilaExcel[] = [];
      for (let f = r + 1; f <= hoja.rowCount; f++) {
        const d = hoja.getRow(f);
        if (esCabecera(d)) break;
        const cierre = [col.abono2, col.descuento, col.total - 2]
          .map((c) => texto(d.getCell(c)).toUpperCase())
          .join(' ');
        if (cierre.includes('TOTAL')) break;
        const nombres = texto(d.getCell(col.nombre));
        if (!nombres || /^TOTAL/i.test(nombres)) continue;

        const marcados = col.dias.map((c) => texto(d.getCell(c)) !== '');
        const abonos = [
          ...montos(d.getCell(col.abono)),
          ...montos(d.getCell(col.abono2)),
        ];
        const descuentos = montos(d.getCell(col.descuento));
        // Filas solo con nombre, sin días ni montos, no aportan nada.
        if (!marcados.some(Boolean) && !abonos.length && !descuentos.length)
          continue;
        if (!inicio) continue; // se avisa abajo, una vez por bloque

        const comentario = [
          texto(d.getCell(col.comentario)),
          texto(d.getCell(col.nota)),
        ]
          .filter((x) => x && x !== ',')
          .join(' · ');
        let dni = texto(d.getCell(col.dni)).replace(/\D/g, '');
        // A veces el DNI está escrito dentro del nombre: «JEAN PAUL ACOSTA SERNA 48761591».
        const dniEnNombre = nombres.match(/\b\d{7,12}\b/)?.[0];
        if (!dni && dniEnNombre) dni = dniEnNombre;
        if (dni.length === 7) dni = `0${dni}`; // Excel se comió el cero inicial
        if (dni && !/^\d{8,12}$/.test(dni)) dni = '';

        leidas.push({
          hoja: hoja.name,
          fila: f,
          inicio,
          fechas: marcados.flatMap((m, i) => (m ? [masDias(inicio, i)] : [])),
          nombres: nombres
            .replace(/\b\d{7,12}\b/g, ' ')
            .replace(/\s+/g, ' ')
            .trim(),
          dni: dni || null,
          cargo: texto(d.getCell(col.cargo)) || null,
          pagoDia: numero(d.getCell(col.pago)) ?? 0,
          abonos,
          descuentos,
          comentario: comentario || null,
          totalExcel: numero(d.getCell(col.total)),
        });
      }
      if (!inicio) {
        // Solo importa si el bloque tenía datos.
        let conDatos = false;
        for (
          let f = r + 1;
          f <= Math.min(hoja.rowCount, r + 40) && !conDatos;
          f++
        ) {
          const d = hoja.getRow(f);
          if (esCabecera(d)) break;
          conDatos =
            !!texto(d.getCell(col.nombre)) &&
            col.dias.some((c) => texto(d.getCell(c)) !== '');
        }
        if (conDatos)
          avisos.push(
            `${hoja.name} fila ${r}: el bloque tiene días marcados pero no tiene fechas`,
          );
      }
      filas.push(...leidas);
    }
  }
  return { filas, avisos };
}

/** Distancia de edición entre dos palabras (para «CARHUACTOCTO» / «CARHUACTOTO»). */
function distancia(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array(b.length).fill(0),
  ]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[a.length][b.length];
}

/** Misma palabra aunque tenga una letra de más o de menos (en palabras de 5 letras o más). */
export function mismaPalabra(a: string, b: string): boolean {
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 5 && distancia(a, b) <= 1;
}

/** Clave para comparar nombres: mayúsculas, sin tildes ni signos, palabras sueltas. */
export function palabras(nombre: string): string[] {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\(.*?\)/g, ' ') // «(AYUDANTE DE OSCAR)» no es parte del nombre
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 1);
}

/** Palabras que comparten dos nombres. */
export function compartidas(a: string, b: string): number {
  const pb = palabras(b);
  return palabras(a).filter((p) => pb.some((q) => mismaPalabra(p, q))).length;
}

/** Misma persona si todas las palabras del nombre más corto (2 o más) están en el otro. */
export function mismoNombre(a: string, b: string): boolean {
  const pa = palabras(a);
  const pb = palabras(b);
  const [corto, largo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  if (corto.length < 2)
    return (
      corto.length === 1 &&
      largo.length === 1 &&
      mismaPalabra(corto[0], largo[0])
    );
  return corto.every((p) => largo.some((q) => mismaPalabra(p, q)));
}
