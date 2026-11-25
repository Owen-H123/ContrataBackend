import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { NOMBRE_CONCEPTO_EXCEL } from './nombres.js';
import { domingoDe, sumarDias, TareoService } from './tareo.service.js';

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
const LETRAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const SOLES = '"S/" #,##0.00';
const NARANJA = 'FFE8650A';
const GRIS = 'FFF2F2F2';

/** «1 de noviembre al 7 de noviembre» */
function tituloSemana(domingo: string) {
  const f = (iso: string) => {
    const [, m, d] = iso.split('-').map(Number);
    return `${d} de ${MESES[m - 1].toLowerCase()}`;
  };
  return `${f(domingo)} al ${f(sumarDias(domingo, 6))}`;
}

/**
 * Exporta el tareo de un mes con el formato de la hoja que usaba RYSCOM: un bloque por
 * semana (domingo a sábado) con Nº, apellidos y nombres, DNI, cargo, los 7 días, total días,
 * pago/día, sub total, otros abonos, otros descuentos, total a pagar y comentarios. Los
 * totales van con fórmulas, para que el contador pueda ajustar y se recalcule.
 */
@Injectable()
export class TareoExcelService {
  constructor(private readonly tareo: TareoService) {}

  async exportarMes(mes: string): Promise<Buffer> {
    const [anio, m] = mes.split('-').map(Number);
    const inicio = `${mes}-01`;
    const fin = new Date(Date.UTC(anio, m, 0)).toISOString().slice(0, 10);

    const libro = new ExcelJS.Workbook();
    libro.creator = 'RYSCOM';
    const hoja = libro.addWorksheet(MESES[m - 1], {
      views: [{ showGridLines: false }],
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });
    hoja.columns = [
      { width: 5 },
      { width: 38 },
      { width: 11 },
      { width: 18 },
      ...LETRAS.map(() => ({ width: 4.5 })),
      { width: 8 },
      { width: 11 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 13 },
      { width: 40 },
      { width: 18 },
    ];
    const ULTIMA = 19; // columna S (estado del pago)
    const borde: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    };
    const titulo = (texto: string, size: number, color = 'FF000000') => {
      const r = hoja.addRow([texto]);
      hoja.mergeCells(r.number, 1, r.number, ULTIMA);
      r.getCell(1).font = { bold: true, size, color: { argb: color } };
      r.getCell(1).alignment = { horizontal: 'center' };
    };
    titulo('HOJA DE TAREO RYSCOM', 14, NARANJA);
    titulo('PLANILLA DE TRABAJOS DE MANTENIMIENTO', 12);
    titulo(`MES: ${MESES[m - 1]} ${anio}`, 11);
    hoja.addRow([]);

    const totalesSemana: string[] = [];
    for (
      let semana = domingoDe(inicio);
      semana <= fin;
      semana = sumarDias(semana, 7)
    ) {
      const datos = await this.tareo.semana(semana);
      if (!datos.filas.length) continue;

      // Título de la semana
      const t = hoja.addRow([tituloSemana(semana)]);
      hoja.mergeCells(t.number, 1, t.number, ULTIMA);
      t.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      t.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: NARANJA },
      };
      t.getCell(1).alignment = { horizontal: 'center' };

      // Dos filas de cabecera: letras del día y número del día
      const cab = ['Nº', 'APELLIDOS Y NOMBRES', 'DNI', 'CARGO'];
      const cola = [
        'TOTAL DIAS',
        'PAGO/DIA',
        'SUB TOTAL',
        'OTROS ABONOS',
        'OTROS DESCUENTOS',
        'TOTAL A PAGAR',
        'COMENTARIOS',
        'PAGO',
      ];
      const c1 = hoja.addRow([...cab, ...LETRAS, ...cola]);
      const c2 = hoja.addRow([
        ...cab,
        ...datos.fechas.map((f) => Number(f.slice(8))),
        ...cola,
      ]);
      for (const c of [c1, c2]) {
        c.eachCell((cell) => {
          cell.font = { bold: true, size: 9 };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: GRIS },
          };
          cell.alignment = {
            horizontal: 'center',
            vertical: 'middle',
            wrapText: true,
          };
          cell.border = borde;
        });
      }
      // Las columnas que no son días ocupan las dos filas de cabecera
      for (const col of [1, 2, 3, 4, 12, 13, 14, 15, 16, 17, 18, 19])
        hoja.mergeCells(c1.number, col, c2.number, col);

      const primera = c2.number + 1;
      datos.filas.forEach((f, i) => {
        const fila = hoja.addRow([]);
        const n = fila.number;
        fila.getCell(1).value = i + 1;
        fila.getCell(2).value = f.trabajador?.nombres ?? '';
        fila.getCell(3).value = f.trabajador?.dni ?? '';
        fila.getCell(4).value = f.cargo;
        f.dias.forEach((d, j) => {
          fila.getCell(5 + j).value = d ? 'X' : null;
          fila.getCell(5 + j).alignment = { horizontal: 'center' };
        });
        fila.getCell(12).value = {
          formula: `COUNTA(E${n}:K${n})`,
          result: f.totalDias,
        };
        fila.getCell(13).value = f.pagoDia;
        fila.getCell(14).value = { formula: `M${n}*L${n}`, result: f.subtotal };
        fila.getCell(15).value = f.abonos || null;
        fila.getCell(16).value = f.descuentos || null;
        fila.getCell(17).value = {
          formula: `N${n}+O${n}-P${n}`,
          result: f.total,
        };
        const detalle = f.movimientos.map(
          (mv) =>
            `${mv.tipo === 'ABONO' ? '+' : '−'}${mv.monto} ${NOMBRE_CONCEPTO_EXCEL[mv.concepto]}${mv.nota ? ` (${mv.nota})` : ''}`,
        );
        fila.getCell(18).value =
          [f.comentario, ...detalle].filter(Boolean).join(' · ') || null;
        fila.getCell(19).value = f.pagadoEn
          ? `Pagado ${f.pagadoEn.split('-').reverse().join('/')}`
          : f.retenido
            ? 'RETENIDO'
            : 'Por pagar';
        for (let c = 1; c <= 19; c++) fila.getCell(c).border = borde;
        for (const c of [13, 14, 15, 16, 17]) fila.getCell(c).numFmt = SOLES;
        fila.getCell(12).alignment = { horizontal: 'center' };
        fila.getCell(17).font = { bold: true };
        fila.getCell(18).alignment = { wrapText: true, vertical: 'top' };
        if (f.retenido && !f.pagadoEn)
          fila.getCell(19).font = { bold: true, color: { argb: 'FFC00000' } };
      });
      const ultima = hoja.rowCount;

      // Total de la planilla de la semana
      const tot = hoja.addRow([]);
      hoja.mergeCells(tot.number, 1, tot.number, 11);
      tot.getCell(1).value = 'TOTAL PLANILLA';
      tot.getCell(1).alignment = { horizontal: 'right' };
      tot.getCell(12).value = {
        formula: `SUM(L${primera}:L${ultima})`,
        result: datos.totales.dias,
      };
      tot.getCell(14).value = {
        formula: `SUM(N${primera}:N${ultima})`,
        result: datos.totales.subtotal,
      };
      tot.getCell(15).value = {
        formula: `SUM(O${primera}:O${ultima})`,
        result: datos.totales.abonos,
      };
      tot.getCell(16).value = {
        formula: `SUM(P${primera}:P${ultima})`,
        result: datos.totales.descuentos,
      };
      tot.getCell(17).value = {
        formula: `SUM(Q${primera}:Q${ultima})`,
        result: datos.totales.total,
      };
      tot.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: GRIS },
        };
      });
      for (const c of [14, 15, 16, 17]) tot.getCell(c).numFmt = SOLES;
      totalesSemana.push(`Q${tot.number}`);
      hoja.addRow([]);
    }

    if (!totalesSemana.length) {
      hoja.addRow(['Sin tareo registrado en este mes.']);
    } else {
      const mesFila = hoja.addRow([]);
      hoja.mergeCells(mesFila.number, 1, mesFila.number, 16);
      mesFila.getCell(1).value =
        `TOTAL MES (${totalesSemana.length} ${totalesSemana.length === 1 ? 'semana' : 'semanas'})`;
      mesFila.getCell(1).alignment = { horizontal: 'right' };
      mesFila.getCell(17).value = { formula: totalesSemana.join('+') };
      mesFila.getCell(17).numFmt = SOLES;
      mesFila.eachCell((cell) => {
        cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: NARANJA },
        };
      });
      const nota = hoja.addRow([
        'Las semanas que cruzan de mes aparecen completas, como en el Excel de siempre. Generado por el sistema RYSCOM.',
      ]);
      hoja.mergeCells(nota.number, 1, nota.number, ULTIMA);
      nota.getCell(1).font = {
        italic: true,
        size: 9,
        color: { argb: 'FF808080' },
      };
    }

    return Buffer.from(await libro.xlsx.writeBuffer());
  }
}
