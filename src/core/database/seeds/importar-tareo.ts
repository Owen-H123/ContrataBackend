import {
  compartidas,
  type FilaExcel,
  leerTareo,
  mismaPalabra,
  mismoNombre,
  palabras,
} from '../../../modules/rrhh/importar/lector-tareo.js';
import { TareoFila } from '../../../modules/rrhh/entities/tareo-fila.entity.js';
import {
  ConceptoMovimiento,
  TareoMovimiento,
  TipoMovimiento,
} from '../../../modules/rrhh/entities/tareo-movimiento.entity.js';
import {
  PeriodicidadSueldo,
  TipoTrabajador,
  Trabajador,
} from '../../../modules/rrhh/entities/trabajador.entity.js';
import dataSource from '../data-source.js';

/**
 * Pasa el Excel «TAREO 2026» al sistema (RRHH › Personal y Tareo).
 *
 *   pnpm importar:tareo "C:/ruta/TAREO 2026.xlsx"            → solo revisa y muestra el reporte
 *   pnpm importar:tareo "C:/ruta/TAREO 2026.xlsx" --guardar  → además lo guarda
 *
 * - Cada día va a su fecha real y a su semana de domingo a sábado (en el Excel algunos
 *   bloques iban de lunes a domingo).
 * - Une a la misma persona aunque esté escrita distinto («yoni torres» y «YONI TORRES LEYVA»,
 *   «CARHUACTOCTO» y «CARHUACTOTO»). Si dos nombres distintos tienen el mismo DNI (copiado por
 *   error), no los une y lo avisa.
 * - Un bloque que aparece en dos hojas (la semana que cruza de mes) se cuenta una sola vez.
 * - «=50+50+50» en abonos se guarda como tres abonos de 50.
 * - «NO ABONAR» en comentarios → pago retenido. «PAGO QUINCENAL 550» → personal fijo.
 * - Las semanas ya terminadas (antes de la actual) quedan como pagadas, salvo las retenidas.
 * - Se puede correr de nuevo: reemplaza las semanas importadas, no duplica.
 */

const archivo = process.argv[2];
const guardar = process.argv.includes('--guardar');
if (!archivo)
  throw new Error(
    'Indica la ruta del Excel: pnpm importar:tareo "C:/…/TAREO 2026.xlsx"',
  );

const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const suma = (xs: number[]) => redondear(xs.reduce((s, x) => s + x, 0));
const totalDe = (
  f: Pick<FilaExcel, 'fechas' | 'pagoDia' | 'abonos' | 'descuentos'>,
) =>
  redondear(f.fechas.length * f.pagoDia + suma(f.abonos) - suma(f.descuentos));
const masDias = (fecha: string, n: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const domingoDe = (fecha: string) =>
  masDias(fecha, -new Date(`${fecha}T12:00:00Z`).getUTCDay());
const limpiarNombre = (n: string) =>
  n
    .replace(/\(.*?\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, 160);
const limpiarCargo = (c: string) =>
  c.replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 60);

const { filas, avisos } = await leerTareo(archivo);

// ---------- 1. Comparar con los totales del Excel ----------
const porHoja = new Map<
  string,
  { nuestro: number; excel: number; filas: number }
>();
const diferencias: string[] = [];
for (const f of filas) {
  const t = totalDe(f);
  const h = porHoja.get(f.hoja) ?? { nuestro: 0, excel: 0, filas: 0 };
  h.nuestro = redondear(h.nuestro + t);
  h.excel = redondear(h.excel + (f.totalExcel ?? 0));
  h.filas++;
  porHoja.set(f.hoja, h);
  if (f.totalExcel !== null && Math.abs(f.totalExcel - t) > 0.01)
    diferencias.push(
      `${f.hoja} fila ${f.fila} · ${f.nombres}: Excel ${f.totalExcel} / días × pago + abonos − descuentos ${t}`,
    );
  else if (f.totalExcel === null && t !== 0)
    diferencias.push(
      `${f.hoja} fila ${f.fila} · ${f.nombres}: el Excel no tenía total / calculado ${t}`,
    );
}

// ---------- 2. Una ficha por persona ----------
interface Persona {
  nombres: string;
  alias: Set<string>;
  dni: string | null;
  cargo: string;
  pagoDia: number;
  ultima: string;
  sueldoQuincenal: number | null;
  /** Nota para la ficha (DNI que en el Excel también usa otra persona). */
  observacion: string | null;
  /** DNI con que aparece en el Excel, aunque lo use otra persona. */
  dniExcel: string | null;
}
const personas: Persona[] = [];
const conflictosDni: string[] = [];
const ordenadas = [...filas].sort((a, b) => a.inicio.localeCompare(b.inicio));
const personaDe = new Map<FilaExcel, Persona>();
/** Con el mismo DNI solo se une si el nombre es el mismo (no basta compartir apellidos). */
const parecido = (p: Persona, nombre: string) =>
  [...p.alias].some((a) => mismoNombre(a, nombre));

/**
 * Nombres que son la misma persona aunque estén escritos muy distinto. Se revisaron a mano
 * en el reporte de «posibles duplicados».
 */
const EQUIVALENCIAS: [string, string][] = [
  ['OSCAR RAUL WONG', 'OSCAR WONG CURITIMA'],
  ['WINDE INZUISA', 'WINDER ISUIZA'],
  ['WINDER IZUSA SANCHEZ', 'WINDER ISUIZA'],
  ['AYUDANTE DAVID', 'JEAN CARLOS MAGUIÑA VILLAVICENCIO'],
];
const clave = (n: string) => palabras(n).join(' ');
for (const f of filas) {
  const eq = EQUIVALENCIAS.find(
    ([variante]) => clave(variante) === clave(f.nombres),
  );
  if (eq) f.nombres = eq[1];
}

for (const f of ordenadas) {
  // Un DNI que en el Excel es de otra persona (copiado por error) no sirve para unir.
  let dniDudoso = false;
  let p = personas.find((x) => {
    if (f.dni && x.dni === f.dni && parecido(x, f.nombres)) return true;
    if (f.dni && x.dni === f.dni) {
      dniDudoso = true;
      conflictosDni.push(
        `DNI ${f.dni}: «${f.nombres}» (${f.hoja} fila ${f.fila}) y «${x.nombres}». Se dejan separados.`,
      );
    }
    return false;
  });
  p ??= personas.find(
    (x) =>
      (dniDudoso || !f.dni || !x.dni || f.dni === x.dni) &&
      [...x.alias].some((a) => mismoNombre(a, f.nombres)),
  );
  if (!p) {
    p = {
      nombres: f.nombres,
      alias: new Set(),
      dni: null,
      cargo: 'SIN CARGO',
      pagoDia: 0,
      ultima: '',
      sueldoQuincenal: null,
      observacion: null,
      dniExcel: null,
    };
    personas.push(p);
  }
  p.alias.add(f.nombres);
  // El DNI es único: si ya lo tiene otra persona, esta queda sin DNI y con una nota
  // para revisar en Personal.
  if (f.dni && !p.dni) {
    const duenio = personas.find((x) => x !== p && x.dni === f.dni);
    if (!duenio) p.dni = f.dni;
    else if (!p.dniExcel) {
      p.dniExcel = f.dni;
      p.observacion = `En el Excel tenía el DNI ${f.dni}, que también aparece para ${limpiarNombre(duenio.nombres)}. Revisa cuál es el correcto.`;
    }
  }
  if (palabras(f.nombres).length > palabras(p.nombres).length)
    p.nombres = f.nombres;
  if (f.inicio >= p.ultima) {
    p.ultima = f.inicio;
    if (f.cargo) p.cargo = f.cargo;
    if (f.pagoDia > 0) p.pagoDia = f.pagoDia;
  }
  const quincenal = f.comentario?.match(/PAGO QUINCENAL\s*(\d+(?:[.,]\d+)?)/i);
  if (quincenal) p.sueldoQuincenal = Number(quincenal[1].replace(',', '.'));
  personaDe.set(f, p);
}

// Nombres de una sola palabra («CONTRERAS», «ELIAQUIN») se unen si solo hay una persona que la tenga.
for (const corto of [...personas]) {
  const [unica, ...resto] = palabras(corto.nombres);
  if (!unica || resto.length) continue;
  const candidatos = personas.filter(
    (x) =>
      x !== corto &&
      palabras(x.nombres).length > 1 &&
      palabras(x.nombres).some((w) => mismaPalabra(w, unica)),
  );
  if (candidatos.length !== 1) continue;
  const destino = candidatos[0];
  for (const a of corto.alias) destino.alias.add(a);
  for (const [f, p] of personaDe) if (p === corto) personaDe.set(f, destino);
  personas.splice(personas.indexOf(corto), 1);
}

// ---------- 3. Una fila por persona y semana (domingo a sábado) ----------
interface Semana {
  persona: Persona;
  semana: string;
  cargo: string;
  pagoDia: number;
  dias: boolean[];
  abonos: number[];
  descuentos: number[];
  /** Ajustes (+/−) para cuadrar con un TOTAL escrito a mano en el Excel. */
  ajustes: number[];
  comentarios: string[];
}
const semanas = new Map<string, Semana>();
const semanaDe = (p: Persona, semana: string, f: FilaExcel) => {
  const clave = `${semana}|${personas.indexOf(p)}`;
  let s = semanas.get(clave);
  if (!s) {
    s = {
      persona: p,
      semana,
      cargo: f.cargo ?? p.cargo,
      pagoDia: f.pagoDia,
      dias: Array(7).fill(false),
      abonos: [],
      descuentos: [],
      ajustes: [],
      comentarios: [],
    };
    semanas.set(clave, s);
  }
  if (f.pagoDia > s.pagoDia) s.pagoDia = f.pagoDia;
  return s;
};

// Un mismo bloque (persona + fecha de inicio) puede estar en dos hojas: los días se juntan
// y los montos se toman una sola vez, del que tenga más días marcados.
const bloques = new Map<string, FilaExcel[]>();
for (const f of ordenadas) {
  const clave = `${personas.indexOf(personaDe.get(f)!)}|${f.inicio}`;
  bloques.set(clave, [...(bloques.get(clave) ?? []), f]);
}
let repetidos = 0;
for (const grupo of bloques.values()) {
  if (grupo.length > 1) repetidos += grupo.length - 1;
  const p = personaDe.get(grupo[0])!;
  const fechas = [...new Set(grupo.flatMap((f) => f.fechas))].sort();
  const principal = [...grupo].sort(
    (a, b) => b.fechas.length - a.fechas.length,
  )[0];
  for (const fecha of fechas) {
    const s = semanaDe(p, domingoDe(fecha), principal);
    s.dias[new Date(`${fecha}T12:00:00Z`).getUTCDay()] = true;
  }
  // Los montos van a la semana con más días del bloque (o a la del inicio si no hay días).
  const cuenta = new Map<string, number>();
  for (const fecha of fechas)
    cuenta.set(domingoDe(fecha), (cuenta.get(domingoDe(fecha)) ?? 0) + 1);
  const destino =
    [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    domingoDe(principal.inicio);
  const s = semanaDe(p, destino, principal);
  s.abonos.push(...principal.abonos);
  s.descuentos.push(...principal.descuentos);
  // Si el Excel tenía un TOTAL escrito a mano distinto de la cuenta, se agrega un ajuste para
  // que lo guardado sea lo que realmente se pagó.
  const calculado = totalDe({ ...principal, fechas });
  if (
    grupo.length === 1 &&
    principal.totalExcel !== null &&
    Math.abs(principal.totalExcel - calculado) > 0.01
  )
    s.ajustes.push(redondear(principal.totalExcel - calculado));
  for (const f of grupo)
    if (f.comentario && !s.comentarios.includes(f.comentario))
      s.comentarios.push(f.comentario);
}

// ---------- 4. Reporte ----------
const totalSemanas = suma(
  [...semanas.values()].map(
    (s) =>
      s.dias.filter(Boolean).length * s.pagoDia +
      suma(s.abonos) -
      suma(s.descuentos) +
      suma(s.ajustes),
  ),
);
console.log(`\nArchivo: ${archivo}`);
console.log(
  `Filas leídas: ${filas.length} · bloques repetidos en dos hojas: ${repetidos} · semanas-trabajador a guardar: ${semanas.size}`,
);
console.log(
  '\nTotales por hoja (días × pago + abonos − descuentos / columna TOTAL del Excel):',
);
for (const [hoja, h] of porHoja)
  console.log(
    `  ${hoja.padEnd(11)} ${String(h.filas).padStart(3)} filas   S/ ${h.nuestro.toFixed(2).padStart(10)} / S/ ${h.excel.toFixed(2).padStart(10)}${Math.abs(h.nuestro - h.excel) > 0.01 ? '   ← diferencia' : ''}`,
  );
console.log(
  `  Total que queda en el sistema (sin repetir bloques): S/ ${totalSemanas.toFixed(2)}`,
);

console.log(`\nPersonal: ${personas.length}`);
for (const p of [...personas].sort((a, b) =>
  a.nombres.localeCompare(b.nombres),
)) {
  const otros = [...p.alias].filter((a) => a !== p.nombres);
  console.log(
    `  ${limpiarNombre(p.nombres).padEnd(38)} ${p.dni ? 'con DNI' : 'sin DNI'}  ${limpiarCargo(p.cargo).padEnd(22)} ${p.sueldoQuincenal ? `fijo S/ ${p.sueldoQuincenal} quincenal` : `S/ ${p.pagoDia}/día`}${otros.length ? `   ← también escrito: ${otros.join(' | ')}` : ''}`,
  );
}

const dudas: string[] = [];
for (let i = 0; i < personas.length; i++)
  for (let j = i + 1; j < personas.length; j++) {
    const a = personas[i].nombres;
    const b = personas[j].nombres;
    const largas = palabras(a).filter(
      (p) => p.length >= 5 && palabras(b).some((q) => mismaPalabra(p, q)),
    );
    if (largas.length)
      dudas.push(`${limpiarNombre(a)}  ↔  ${limpiarNombre(b)}`);
  }
if (dudas.length) {
  console.log(
    `\nPosibles duplicados para revisar (comparten apellido o nombre poco común): ${dudas.length}`,
  );
  for (const d of dudas) console.log(`  ${d}`);
}
const conNota = personas.filter((p) => p.observacion);
if (conNota.length) {
  console.log(`
Entran sin DNI y con aviso en Personal (su DNI del Excel ya es de otra persona): ${conNota.length}`);
  for (const p of conNota)
    console.log(`  ${limpiarNombre(p.nombres)}: ${p.observacion}`);
}
if (conflictosDni.length) {
  console.log('\nDNI repetido con nombres distintos (revisar en el Excel):');
  for (const c of [...new Set(conflictosDni)]) console.log(`  ${c}`);
}
if (diferencias.length) {
  console.log(
    `\nFilas donde la columna TOTAL del Excel no coincide (${diferencias.length}):`,
  );
  for (const d of diferencias) console.log(`  ${d}`);
}
if (avisos.length) {
  console.log('\nAvisos:');
  for (const a of avisos) console.log(`  ${a}`);
}

if (!guardar) {
  console.log(
    '\nSolo se revisó. Para guardar, vuelve a correrlo con --guardar.\n',
  );
  process.exit(0);
}

// ---------- 5. Guardar ----------
const hoy = new Date().toLocaleDateString('en-CA');
const domingoActual = domingoDe(hoy);

await dataSource.initialize();
try {
  await dataSource.transaction(async (em) => {
    const repoT = em.getRepository(Trabajador);
    const repoF = em.getRepository(TareoFila);
    const repoM = em.getRepository(TareoMovimiento);
    const existentes = await repoT.find();
    const idDe = new Map<Persona, string>();

    for (const p of personas) {
      // Por DNI si ambos lo tienen; por nombre solo si a uno le falta (dos DNIs distintos
      // con el mismo nombre son dos personas).
      let t = existentes.find(
        (e) =>
          (p.dni && e.dni === p.dni) ||
          ((!p.dni || !e.dni) &&
            [...p.alias].some((a) => mismoNombre(a, e.nombres))),
      );
      const fijo = p.sueldoQuincenal !== null;
      if (!t) {
        t = await repoT.save(
          repoT.create({
            nombres: limpiarNombre(p.nombres),
            dni: p.dni,
            cargo: limpiarCargo(p.cargo),
            tipo: fijo ? TipoTrabajador.FIJO : TipoTrabajador.JORNAL,
            pagoDia: p.pagoDia,
            sueldo: p.sueldoQuincenal,
            periodicidad: fijo ? PeriodicidadSueldo.QUINCENAL : null,
            activo: true,
            observacion: p.observacion,
          }),
        );
        existentes.push(t);
      } else if (!t.dni && p.dni && !existentes.some((e) => e.dni === p.dni)) {
        t.dni = p.dni;
        await repoT.save(t);
      }
      idDe.set(p, t.id);
    }

    let creadas = 0;
    let reemplazadas = 0;
    for (const s of semanas.values()) {
      const trabajadorId = idDe.get(s.persona)!;
      const comentario = s.comentarios.join(' · ').slice(0, 500) || null;
      const retenido = /NO ABONAR/i.test(comentario ?? '');
      const total =
        s.dias.filter(Boolean).length * s.pagoDia +
        suma(s.abonos) -
        suma(s.descuentos) +
        suma(s.ajustes);
      const pagada =
        masDias(s.semana, 6) < domingoActual && !retenido && total > 0;

      let fila = await repoF.findOneBy({ semana: s.semana, trabajadorId });
      if (fila) {
        reemplazadas++;
        await repoM.delete({ filaId: fila.id });
      } else {
        creadas++;
        fila = repoF.create({ semana: s.semana, trabajadorId });
      }
      Object.assign(fila, {
        cargo: limpiarCargo(s.cargo),
        pagoDia: s.pagoDia,
        dias: s.dias,
        retenido,
        comentario,
        pagadoEn: pagada ? masDias(s.semana, 6) : null,
        medioPago: null,
        operacion: pagada ? 'Importado del Excel' : null,
      } satisfies Partial<TareoFila>);
      const guardada = await repoF.save(fila);

      const conceptoDescuento = /PR[EÉ]STAMO/i.test(comentario ?? '')
        ? ConceptoMovimiento.PRESTAMO
        : /ADELANTO/i.test(comentario ?? '')
          ? ConceptoMovimiento.ADELANTO
          : ConceptoMovimiento.OTRO;
      const movimientos = [
        ...s.abonos.map((monto) => ({
          tipo: TipoMovimiento.ABONO,
          concepto: ConceptoMovimiento.OTRO,
          monto,
          nota: 'Del Excel de tareo',
        })),
        ...s.descuentos.map((monto) => ({
          tipo: TipoMovimiento.DESCUENTO,
          concepto: conceptoDescuento,
          monto,
          nota: 'Del Excel de tareo',
        })),
        ...s.ajustes.map((monto) => ({
          tipo: monto > 0 ? TipoMovimiento.ABONO : TipoMovimiento.DESCUENTO,
          concepto: ConceptoMovimiento.OTRO,
          monto: Math.abs(monto),
          nota: 'Ajuste para cuadrar con el total escrito en el Excel',
        })),
      ];
      if (movimientos.length)
        await repoM.save(
          movimientos.map((m) => repoM.create({ ...m, filaId: guardada.id })),
        );
    }
    console.log(
      `\nGuardado: ${personas.length} trabajadores, ${creadas} semanas nuevas, ${reemplazadas} reemplazadas.\n`,
    );
  });
} finally {
  await dataSource.destroy();
}
