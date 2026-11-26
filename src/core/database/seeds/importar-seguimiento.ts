// Primero la conexión: carga las entidades en el orden correcto (evita ciclos de importación).
import dataSource from '../data-source.js';
import { IsNull, Not } from 'typeorm';
import { Cliente } from '../../../modules/master/clientes/entities/cliente.entity.js';
import { Sitio } from '../../../modules/master/sitios/entities/sitio.entity.js';
import { OrdenCompra } from '../../../modules/planning/ordenes-compra/entities/orden-compra.entity.js';
import { EventoTrabajo } from '../../../modules/planning/trabajos/entities/evento-trabajo.entity.js';
import { RevisionPresupuesto } from '../../../modules/planning/trabajos/entities/revision-presupuesto.entity.js';
import {
  AreaTrabajo,
  calcularEtapa,
  Criticidad,
  MotivoCancelacion,
  Trabajo,
} from '../../../modules/planning/trabajos/entities/trabajo.entity.js';
import {
  juntarAvances,
  leerSdp,
  llaveSitio,
} from '../../../modules/planning/trabajos/importar/lector-sdp.js';
import {
  armar,
  unir,
} from '../../../modules/planning/trabajos/importar/unir-sdp.js';

/**
 * Pasa el Excel «CORRECTIVO CONTROL SDP» al Seguimiento.
 *
 *   pnpm importar:seguimiento "C:/ruta/CORRECTIVO CONTROL SDP.xlsx"            → solo el reporte
 *   pnpm importar:seguimiento "C:/ruta/CORRECTIVO CONTROL SDP.xlsx" --guardar  → además guarda
 *
 * - Une las hojas del mismo año: el presupuesto (PPT SOLICITADOS) con su fila de ejecutados
 *   y la de control de SDP, por sitio (LI0753 = PE-01-LI-00753-10) y monto o descripción.
 * - Lo que no se pudo unir con seguridad entra igual, marcado «Revisar» con el motivo.
 * - El cliente se busca por nombre (SDP → Sites del Perú). Si no existe, esas filas no entran
 *   y salen en el reporte: no se inventan RUC.
 * - Los sitios que faltan se crean. Las OC que ya están en el sistema se enlazan.
 * - Cuando el Excel dice que se llegó a un paso pero no su fecha, se pone una aproximada.
 * - Se puede correr de nuevo: reemplaza lo importado antes (no toca lo creado a mano).
 */

const archivo = process.argv[2];
const guardar = process.argv.includes('--guardar');
if (!archivo)
  throw new Error(
    'Indica la ruta del Excel: pnpm importar:seguimiento "C:/…/CORRECTIVO CONTROL SDP.xlsx"',
  );

const sinTildes = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
/** Cómo puede figurar cada abreviatura del Excel en la razón social del cliente. */
const ALIAS: Record<string, string[]> = {
  SDP: ['SITES DEL PERU', 'SDP'],
  CTMARES: ['CTMARES', 'CT MARES'],
  LPS: ['LPS'],
};
const soles = (n: number) =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const libro = await leerSdp(archivo);
// Los dos años juntos: un presupuesto de 2025 puede ejecutarse y facturarse en 2026.
const pptFilas = [...libro[2025].ppt, ...libro[2026].ppt];
const ppt = juntarAvances(pptFilas);
const ejecutados = [...libro[2025].ejecutados, ...libro[2026].ejecutados];
const control = libro[2026].control;
const { grupos, sueltos } = unir(ppt, ejecutados, control);
const unidosE = grupos.filter(
  (g) => g.ejecutado && g.base !== g.ejecutado,
).length;
const unidosC = grupos.filter((g) => g.control).length;
console.log(
  `\nExcel: ${pptFilas.length} filas de presupuestos (2025-2026) = ${ppt.length} presupuestos al juntar sus avances, ${ejecutados.length} ejecutados (${unidosE} unidos a su presupuesto), ${control.length} de control SDP (${unidosC} completan un trabajo; ${sueltos.length} sin pareja no se usan) → ${grupos.length} trabajos`,
);
if (process.argv.includes('--detalle'))
  for (const g of grupos.filter((x) => x.avisos.length).slice(0, 40))
    console.log(
      `  [${g.base.fuente}] ${g.base.hoja} #${g.base.fila} ${g.base.codigo} ${g.base.nombre} | ${g.base.descripcion.slice(0, 50)} | ${g.base.montos.join(', ')} → candidatos: ${
        grupos
          .filter(
            (o) =>
              o !== g &&
              o.base.fuente === 'PPT' &&
              o.base.llave === g.base.llave,
          )
          .map(
            (o) =>
              `${o.base.hoja.slice(-4)}#${o.base.fila} ${o.base.descripcion.slice(0, 30)} [${o.base.montos.join('/')}]${o[g.base.fuente === 'CONTROL' ? 'control' : 'ejecutado'] ? ' (ocupado)' : ''}`,
          )
          .join(' ; ') || 'ninguno con ese sitio'
      }`,
    );
const armados = grupos.map(armar);

await dataSource.initialize();
try {
  const clientes = await dataSource.getRepository(Cliente).find();
  const clientePara = (abrev: string) => {
    const nombres = ALIAS[abrev] ?? [abrev];
    return (
      clientes.find((c) =>
        nombres.some((n) => sinTildes(c.razonSocial).includes(n)),
      ) ?? null
    );
  };
  const sinCliente = new Map<string, number>();
  const conCliente = armados.flatMap((a) => {
    const c = clientePara(a.cliente);
    if (!c) {
      sinCliente.set(a.cliente, (sinCliente.get(a.cliente) ?? 0) + 1);
      return [];
    }
    return [{ ...a, cliente: c }];
  });

  const sitios = await dataSource.getRepository(Sitio).find();
  const porLlave = new Map(
    sitios.map((s) => [llaveSitio(s.codigo, s.nombre), s]),
  );
  const nuevosSitios = new Map<
    string,
    { codigo: string; nombre: string; clienteId: string }
  >();
  for (const a of conCliente)
    if (!porLlave.has(a.llave) && !nuevosSitios.has(a.llave))
      nuevosSitios.set(a.llave, {
        codigo: a.codigo || a.nombre.slice(0, 40),
        nombre: a.nombre,
        clienteId: a.cliente.id,
      });

  const ordenes = await dataSource.getRepository(OrdenCompra).find();
  const ordenPara = (numero: string | null, clienteId: string) =>
    numero
      ? (ordenes.find(
          (o) => o.numero === numero && o.clienteId === clienteId,
        ) ?? null)
      : null;

  // ---------- Reporte ----------
  const etapas = new Map<string, { n: number; monto: number }>();
  for (const a of conCliente) {
    const etapa = calcularEtapa({
      ...a,
      ordenId: null,
      cancelado: a.cancelado as MotivoCancelacion | null,
    });
    const e = etapas.get(etapa) ?? { n: 0, monto: 0 };
    e.n++;
    e.monto += a.monto ?? 0;
    etapas.set(etapa, e);
  }
  console.log('\nPor etapa:');
  for (const [etapa, e] of etapas)
    console.log(
      `  ${etapa.padEnd(13)} ${String(e.n).padStart(4)}   ${soles(e.monto)}`,
    );
  const revisar = conCliente.filter((a) => a.avisos.length);
  console.log(`\nPara revisar: ${revisar.length}`);
  for (const a of revisar.slice(0, 12))
    console.log(`  - ${a.codigo} ${a.nombre}: ${a.avisos.join('; ')}`);
  if (revisar.length > 12) console.log(`  … y ${revisar.length - 12} más`);
  console.log(
    `Sitios nuevos: ${nuevosSitios.size}. OC del sistema enlazadas: ${conCliente.filter((a) => ordenPara(a.ocNumero, a.cliente.id)).length}.`,
  );
  if (sinCliente.size)
    console.log(
      `No entran (el cliente no está registrado): ${[...sinCliente].map(([c, n]) => `${c} ${n}`).join(', ')}`,
    );
  console.log(`\nTotal a importar: ${conCliente.length} trabajos.`);

  if (!guardar) {
    console.log('\nSolo revisión. Para guardar, agrega --guardar.\n');
  } else {
    await dataSource.transaction(async (em) => {
      const borrados = await em.delete(Trabajo, { importadoDe: Not(IsNull()) });
      for (const [llave, s] of nuevosSitios) {
        let codigo = s.codigo;
        for (let i = 2; await em.existsBy(Sitio, { codigo }); i++)
          codigo = `${s.codigo.slice(0, 36)}-${i}`;
        porLlave.set(llave, await em.save(em.create(Sitio, { ...s, codigo })));
      }
      for (const a of conCliente) {
        const orden = ordenPara(a.ocNumero, a.cliente.id);
        const t = em.create(Trabajo, {
          clienteId: a.cliente.id,
          sitioId: porLlave.get(a.llave)!.id,
          descripcion: a.descripcion,
          area: a.area as AreaTrabajo,
          criticidad: a.criticidad as Criticidad | null,
          encargado: a.encargado,
          monto: a.monto,
          solicitadoEn: a.solicitadoEn,
          enviadoEn: a.enviadoEn,
          revisadoEn: a.revisadoEn,
          aprobadoEn: a.aprobadoEn,
          aprobadoPor: a.aprobadoPor,
          ordenId: orden?.id ?? null,
          ocNumero: orden ? null : a.ocNumero,
          ocEn: a.ocEn,
          ejecucionInicio: a.ejecucionInicio,
          ejecutadoEn: a.ejecutadoEn,
          eaResponsable: a.eaResponsable,
          eaSolicitadaEn: a.eaSolicitadaEn,
          eaAprobadaEn: a.eaAprobadaEn,
          facturaNumero: a.facturaNumero,
          facturadoEn: a.facturadoEn,
          montoFacturado: a.montoFacturado,
          cobradoEn: a.cobradoEn,
          montoCobrado: a.montoCobrado,
          cancelado: a.cancelado as MotivoCancelacion | null,
          canceladoEn: a.canceladoEn,
          comentario: a.comentarios.join('\n').slice(0, 2000) || null,
          observacion: a.avisos.join('. ').slice(0, 300) || null,
          importadoDe: a.importadoDe,
        });
        t.etapa = calcularEtapa(t);
        const guardado = await em.save(t);
        // Una por una, para que queden en orden (inicial primero).
        for (const [i, monto] of a.revisiones.entries())
          await em.save(
            em.create(RevisionPresupuesto, {
              trabajoId: guardado.id,
              monto,
              // Hora explícita: dentro de la transacción todas tendrían la misma.
              creadoEn: new Date(Date.now() + i),
              fecha:
                i === 0
                  ? (a.enviadoEn ?? a.solicitadoEn)
                  : (a.revisadoEn ?? a.enviadoEn ?? a.solicitadoEn),
              nota:
                i === 0
                  ? 'Presupuesto inicial (del Excel)'
                  : `Revisión ${i} (del Excel)`,
            }),
          );
        await em.save(
          em.create(EventoTrabajo, {
            trabajoId: guardado.id,
            tipo: 'IMPORTADO',
            texto:
              `Importado del Excel de control: ${a.origen}. Las fechas que el Excel no tenía son aproximadas.`.slice(
                0,
                500,
              ),
            usuarioNombre: 'Importación',
          }),
        );
      }
      console.log(
        `\nGuardado: ${conCliente.length} trabajos (${borrados.affected ?? 0} importados antes se reemplazaron), ${nuevosSitios.size} sitios nuevos.\n`,
      );
    });
  }
} finally {
  await dataSource.destroy();
}
