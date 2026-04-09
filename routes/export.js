const express = require('express');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { db, parseVisita } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function getVisitasForExport(user, query) {
  const { userId } = query;
  let rows;
  if (user.rol === 'admin') {
    if (userId) {
      rows = db.prepare('SELECT * FROM visitas WHERE userId = ? ORDER BY fecha DESC').all(parseInt(userId));
    } else {
      rows = db.prepare('SELECT * FROM visitas ORDER BY fecha DESC').all();
    }
  } else {
    rows = db.prepare('SELECT * FROM visitas WHERE userId = ? ORDER BY fecha DESC').all(user.id);
  }
  return rows.map(parseVisita);
}

// GET /api/export/excel
router.get('/excel', requireAuth, async (req, res) => {
  const data = getVisitasForExport(req.user, req.query);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'DarAval';
  const ws = wb.addWorksheet('Visitas', { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = [
    { header: 'Fecha',             key: 'fecha',            width: 13 },
    { header: 'Hora',              key: 'hora',             width: 8  },
    { header: 'Ejecutivo',         key: 'ejecutivo',        width: 22 },
    { header: 'Empresa',           key: 'contactoEmpresa',  width: 26 },
    { header: 'Contacto',          key: 'contactoNombre',   width: 22 },
    { header: 'Cargo',             key: 'contactoCargo',    width: 20 },
    { header: 'Barrio',            key: 'barrio',           width: 18 },
    { header: 'Tipo Visita',       key: 'tipoVisita',       width: 18 },
    { header: 'Rubro',             key: 'contactoRubro',    width: 22 },
    { header: 'Productos',         key: 'productos',        width: 38 },
    { header: 'Resultado',         key: 'resultado',        width: 22 },
    { header: 'Próxima Acción',    key: 'proximaAccion',    width: 30 },
    { header: 'Fecha Seguimiento', key: 'fechaSeguimiento', width: 16 },
    { header: 'Monto Potencial',   key: 'montoPotencial',   width: 16 },
    { header: 'Notas',             key: 'notas',            width: 45 },
    { header: 'Teléfono',          key: 'contactoTel',      width: 16 },
    { header: 'Email',             key: 'contactoEmail',    width: 28 },
  ];

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell(cell => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A0A0A' } };
    cell.font   = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10, name: 'Calibri' };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF00C853' } } };
  });

  const resultadoColors = {
    'Propuesta entregada':  { bg: 'FFD0E4F7', font: 'FF2563A8' },
    'Requiere seguimiento': { bg: 'FFFFF3CD', font: 'FFC8922F' },
    'Sin interés':          { bg: 'FFFDE8E4', font: 'FFC84B2F' },
  };

  data.forEach((v, i) => {
    const row = ws.addRow({
      ...v,
      productos: (v.productos || []).join(', '),
    });
    row.height = 18;

    // Alternating row background
    const bgArgb = i % 2 === 0 ? 'FFFFFFFF' : 'FFF0F0F0';
    row.eachCell({ includeEmpty: true }, cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
      cell.font = { size: 9, name: 'Calibri' };
      cell.alignment = { vertical: 'middle' };
    });

    // Color-code resultado
    const resultadoCell = row.getCell('resultado');
    const colorSet = resultadoColors[v.resultado];
    if (colorSet) {
      resultadoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorSet.bg } };
      resultadoCell.font = { color: { argb: colorSet.font }, bold: true, size: 9 };
    }

    // Format monto
    const montoCell = row.getCell('montoPotencial');
    montoCell.numFmt = '#,##0.00';
    montoCell.alignment = { horizontal: 'right', vertical: 'middle' };
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

  const filename = `DarAval_Visitas_${new Date().toISOString().split('T')[0]}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
});

// GET /api/export/pdf
router.get('/pdf', requireAuth, (req, res) => {
  const data = getVisitasForExport(req.user, req.query);

  // A4 Landscape: 841.89 x 595.28 points
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30, bufferPages: true });

  const filename = `DarAval_Visitas_${new Date().toISOString().split('T')[0]}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  const INK    = '#0a0a0a';
  const PAPER  = '#ffffff';
  const ACCENT = '#00c853';
  const MUTED  = '#666666';
  const CREAM  = '#f0f0f0';

  const pageW   = 841.89;
  const pageH   = 595.28;
  const margin  = 30;
  const contentW = pageW - margin * 2;

  // ── HEADER BLOCK ──
  doc.rect(0, 0, pageW, 52).fill(INK);
  doc.rect(0, 49, pageW, 3).fill(ACCENT);
  doc.font('Helvetica-Bold').fontSize(20).fillColor(PAPER).text('Dar', margin, 14, { continued: true });
  doc.fillColor(ACCENT).text('Aval', { continued: true });
  doc.fillColor(PAPER).font('Helvetica').fontSize(11).text('  —  Registro de Visitas Comerciales', { continued: false });

  const exportDate = new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
     .text(`Exportado: ${exportDate}  ·  ${data.length} registro${data.length !== 1 ? 's' : ''}`, margin, 35);

  // ── TABLE DEFINITION ──
  const cols = [
    { label: 'Fecha',     key: 'fecha',           w: 60  },
    { label: 'Ejecutivo', key: 'ejecutivo',        w: 95  },
    { label: 'Empresa',   key: 'contactoEmpresa',  w: 120 },
    { label: 'Contacto',  key: 'contactoNombre',   w: 100 },
    { label: 'Barrio',    key: 'barrio',           w: 80  },
    { label: 'Tipo',      key: 'tipoVisita',       w: 78  },
    { label: 'Resultado', key: 'resultado',        w: 105 },
    { label: 'Monto',     key: 'montoPotencial',   w: 44  },
  ];
  // Scale columns to fit content width
  const totalCols = cols.reduce((a, c) => a + c.w, 0);
  const scale = contentW / totalCols;
  cols.forEach(c => { c.w = Math.floor(c.w * scale); });

  const rowH   = 18;
  const headerH = 22;
  let y = 58;

  function drawTableHeader() {
    doc.rect(margin, y, contentW, headerH).fill(INK);
    let x = margin;
    doc.font('Helvetica-Bold').fontSize(7).fillColor(PAPER);
    cols.forEach(col => {
      doc.text(col.label.toUpperCase(), x + 4, y + 7, { width: col.w - 8, lineBreak: false, ellipsis: true });
      x += col.w;
    });
    y += headerH;
  }

  drawTableHeader();

  const resultadoColors = {
    'Propuesta entregada':  '#2563a8',
    'Requiere seguimiento': '#c8922f',
    'Sin interés':          '#c84b2f',
  };

  data.forEach((v, i) => {
    // Page break
    if (y + rowH > pageH - margin - 20) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 });
      y = margin;
      drawTableHeader();
    }

    const bg = i % 2 === 0 ? PAPER : CREAM;
    doc.rect(margin, y, contentW, rowH).fill(bg);

    // Row border
    doc.rect(margin, y, contentW, rowH).lineWidth(0.3).stroke('#d4cdc0');

    let rx = margin;
    cols.forEach(col => {
      let val = v[col.key];
      let color = INK;
      let bold = false;

      if (col.key === 'resultado') {
        color = resultadoColors[val] || MUTED;
        bold = true;
      } else if (col.key === 'montoPotencial') {
        val = val ? `$${Number(val).toLocaleString('es-AR')}` : '';
      }

      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(7.5)
         .fillColor(color)
         .text(String(val || ''), rx + 4, y + 5, { width: col.w - 8, lineBreak: false, ellipsis: true });
      rx += col.w;
    });

    y += rowH;
  });

  // ── PAGE NUMBERS ──
  const range = doc.bufferedPageRange();
  for (let p = 0; p < range.count; p++) {
    doc.switchToPage(p);
    doc.font('Helvetica').fontSize(7).fillColor(MUTED)
       .text(`DarAval · Pág. ${p + 1} de ${range.count}`, margin, pageH - 25, { width: contentW, align: 'right' });
  }

  doc.end();
});

module.exports = router;
