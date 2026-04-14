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

function getVisitasFiltered(user, query) {
  const { userId, fechaDesde, fechaHasta, resultado } = query;
  let sql = 'SELECT * FROM visitas WHERE 1=1';
  const params = [];
  if (user.rol !== 'admin') {
    sql += ' AND userId = ?'; params.push(user.id);
  } else if (userId) {
    sql += ' AND userId = ?'; params.push(parseInt(userId));
  }
  if (fechaDesde) { sql += ' AND fecha >= ?'; params.push(fechaDesde); }
  if (fechaHasta) { sql += ' AND fecha <= ?'; params.push(fechaHasta); }
  if (resultado)  { sql += ' AND resultado = ?'; params.push(resultado); }
  sql += ' ORDER BY fecha DESC';
  return db.prepare(sql).all(...params).map(parseVisita);
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
    { header: 'Proxima Accion',    key: 'proximaAccion',    width: 30 },
    { header: 'Fecha Seguimiento', key: 'fechaSeguimiento', width: 16 },
    { header: 'Monto Potencial',   key: 'montoPotencial',   width: 16 },
    { header: 'Notas',             key: 'notas',            width: 45 },
    { header: 'Telefono',          key: 'contactoTel',      width: 16 },
    { header: 'Email',             key: 'contactoEmail',    width: 28 },
  ];
  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell(cell => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } };
    cell.font   = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10, name: 'Calibri' };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF00C853' } } };
  });
  const resultadoColors = {
    'Propuesta entregada':  { bg: 'FFD0E4F7', font: 'FF2563A8' },
    'Requiere seguimiento': { bg: 'FFFFF3CD', font: 'FFC8922F' },
    'Sin interes':          { bg: 'FFFDE8E4', font: 'FFC84B2F' },
    'Contrato cerrado':     { bg: 'FFD4EDDA', font: 'FF1B5E20' },
  };
  data.forEach((v, i) => {
    const row = ws.addRow({ ...v, productos: (v.productos || []).join(', ') });
    row.height = 18;
    const bgArgb = i % 2 === 0 ? 'FFFFFFFF' : 'FFF8F8F8';
    row.eachCell({ includeEmpty: true }, cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
      cell.font = { size: 9, name: 'Calibri' };
      cell.alignment = { vertical: 'middle' };
    });
    const colorSet = resultadoColors[v.resultado];
    if (colorSet) {
      const rc = row.getCell('resultado');
      rc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorSet.bg } };
      rc.font = { color: { argb: colorSet.font }, bold: true, size: 9 };
    }
    const mc = row.getCell('montoPotencial');
    mc.numFmt = '#,##0.00';
    mc.alignment = { horizontal: 'right', vertical: 'middle' };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
  const filename = 'DarAval_Visitas_' + new Date().toISOString().split('T')[0] + '.xlsx';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  await wb.xlsx.write(res);
  res.end();
});

// GET /api/export/pdf
router.get('/pdf', requireAuth, (req, res) => {
  const data = getVisitasForExport(req.user, req.query);
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30, bufferPages: true });
  const filename = 'DarAval_Visitas_' + new Date().toISOString().split('T')[0] + '.pdf';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  doc.pipe(res);
  const INK = '#1a1a1a', PAPER = '#ffffff', ACCENT = '#00c853', MUTED = '#888888', CREAM = '#f5f5f5';
  const pageW = 841.89, pageH = 595.28, margin = 30, contentW = pageW - margin * 2;
  doc.rect(0, 0, pageW, 52).fill(INK);
  doc.rect(0, 49, pageW, 3).fill(ACCENT);
  doc.font('Helvetica-Bold').fontSize(20).fillColor(PAPER).text('Dar', margin, 14, { continued: true });
  doc.fillColor(ACCENT).text('Aval', { continued: true });
  doc.fillColor(PAPER).font('Helvetica').fontSize(11).text('  -  Registro de Visitas Comerciales', { continued: false });
  const exportDate = new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Exportado: ' + exportDate + '  -  ' + data.length + ' registro' + (data.length !== 1 ? 's' : ''), margin, 35);
  const cols = [
    { label: 'Fecha', key: 'fecha', w: 60 }, { label: 'Ejecutivo', key: 'ejecutivo', w: 95 },
    { label: 'Empresa', key: 'contactoEmpresa', w: 120 }, { label: 'Contacto', key: 'contactoNombre', w: 100 },
    { label: 'Barrio', key: 'barrio', w: 80 }, { label: 'Tipo', key: 'tipoVisita', w: 78 },
    { label: 'Resultado', key: 'resultado', w: 105 }, { label: 'Monto', key: 'montoPotencial', w: 44 },
  ];
  const scale = contentW / cols.reduce((a, c) => a + c.w, 0);
  cols.forEach(c => { c.w = Math.floor(c.w * scale); });
  const rowH = 18, headerH = 22;
  let y = 58;
  function drawTableHeader() {
    doc.rect(margin, y, contentW, headerH).fill(INK);
    let x = margin;
    doc.font('Helvetica-Bold').fontSize(7).fillColor(PAPER);
    cols.forEach(col => { doc.text(col.label.toUpperCase(), x + 4, y + 7, { width: col.w - 8, lineBreak: false, ellipsis: true }); x += col.w; });
    y += headerH;
  }
  drawTableHeader();
  const rColors = { 'Propuesta entregada': '#2563a8', 'Requiere seguimiento': '#c8922f', 'Sin interes': '#c84b2f', 'Contrato cerrado': '#1b5e20' };
  data.forEach((v, i) => {
    if (y + rowH > pageH - margin - 20) { doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 }); y = margin; drawTableHeader(); }
    doc.rect(margin, y, contentW, rowH).fill(i % 2 === 0 ? PAPER : CREAM);
    doc.rect(margin, y, contentW, rowH).lineWidth(0.3).stroke('#e0e0e0');
    let rx = margin;
    cols.forEach(col => {
      let val = v[col.key], color = INK, bold = false;
      if (col.key === 'resultado') { color = rColors[val] || MUTED; bold = true; }
      else if (col.key === 'montoPotencial') { val = val ? '$' + Number(val).toLocaleString('es-AR') : ''; }
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor(color).text(String(val || ''), rx + 4, y + 5, { width: col.w - 8, lineBreak: false, ellipsis: true });
      rx += col.w;
    });
    y += rowH;
  });
  const range = doc.bufferedPageRange();
  for (let p = 0; p < range.count; p++) {
    doc.switchToPage(p);
    doc.font('Helvetica').fontSize(7).fillColor(MUTED).text('DarAval - Pag. ' + (p + 1) + ' de ' + range.count, margin, pageH - 25, { width: contentW, align: 'right' });
  }
  doc.end();
});

// GET /api/export/dashboard
router.get('/dashboard', requireAuth, (req, res) => {
  const data = getVisitasFiltered(req.user, req.query);
  const { fechaDesde, fechaHasta, resultado: filtroResultado } = req.query;
  let ejecutivoNombre = 'Todos los ejecutivos';
  if (req.query.userId && req.user.rol === 'admin') {
    const u = db.prepare('SELECT nombre FROM users WHERE id = ?').get(parseInt(req.query.userId));
    if (u) ejecutivoNombre = u.nombre;
  } else if (req.user.rol !== 'admin') {
    ejecutivoNombre = req.user.nombre;
  }
  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 40, bufferPages: true });
  const filename = 'DarAval_Dashboard_' + new Date().toISOString().split('T')[0] + '.pdf';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  doc.pipe(res);
  const INK = '#1a1a1a', PAPER = '#ffffff', ACCENT = '#00c853', ACCENT2 = '#2979ff';
  const GOLD = '#d97706', VERDE_OSC = '#1b5e20', MUTED = '#888888', SURFACE = '#f5f5f5';
  const pageW = 595.28, pageH = 841.89, margin = 40, contentW = pageW - margin * 2;
  // Header
  doc.rect(0, 0, pageW, 60).fill(INK);
  doc.rect(0, 57, pageW, 3).fill(ACCENT);
  doc.font('Helvetica-Bold').fontSize(22).fillColor(PAPER).text('Dar', margin, 16, { continued: true });
  doc.fillColor(ACCENT).text('Aval', { continued: true });
  doc.fillColor(PAPER).font('Helvetica').fontSize(12).text('  -  Analisis Comercial', { continued: false });
  const exportDate = new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Generado: ' + exportDate, margin, 42);
  let y = 78;
  // Filtros
  const filtros = [];
  if (fechaDesde) filtros.push('Desde: ' + fechaDesde);
  if (fechaHasta) filtros.push('Hasta: ' + fechaHasta);
  filtros.push('Ejecutivo: ' + ejecutivoNombre);
  if (filtroResultado) filtros.push('Resultado: ' + filtroResultado);
  doc.rect(margin, y, contentW, 22).fill(SURFACE);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Filtros: ' + filtros.join('  -  '), margin + 10, y + 7, { width: contentW - 20 });
  y += 32;
  // KPIs
  const total      = data.length;
  const propuestas = data.filter(v => v.resultado === 'Propuesta entregada').length;
  const seguimiento= data.filter(v => v.resultado === 'Requiere seguimiento').length;
  const contratos  = data.filter(v => v.resultado === 'Contrato cerrado').length;
  const monto = data.reduce((a, v) => a + (v.montoPotencial || 0), 0);
  const kpiW = (contentW - 12) / 4;
  [
    { label: 'Total Visitas', value: total,       color: INK,       sub: 'registradas' },
    { label: 'Propuestas',    value: propuestas,   color: ACCENT2,   sub: 'entregadas'  },
    { label: 'Seguimientos',  value: seguimiento,  color: GOLD,      sub: 'pendientes'  },
    { label: 'Contratos',     value: contratos,    color: VERDE_OSC, sub: 'cerrados'    },
  ].forEach((k, i) => {
    const kx = margin + i * (kpiW + 4);
    doc.rect(kx, y, kpiW, 62).fill(PAPER).stroke('#e0e0e0');
    doc.rect(kx, y, 3, 62).fill(k.color);
    doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(k.label.toUpperCase(), kx + 10, y + 10);
    doc.font('Helvetica-Bold').fontSize(28).fillColor(k.color).text(String(k.value), kx + 10, y + 20);
    doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(k.sub, kx + 10, y + 50);
  });
  y += 74;
  // Monto
  doc.rect(margin, y, contentW, 28).fill(SURFACE);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('MONTO POTENCIAL TOTAL', margin + 10, y + 8);
  doc.font('Helvetica-Bold').fontSize(14).fillColor(ACCENT).text('$' + monto.toLocaleString('es-AR', { minimumFractionDigits: 0 }), margin + contentW - 150, y + 7, { width: 140, align: 'right' });
  y += 40;
  function drawBreakdown(title, entries, color) {
    if (y + 180 > pageH - margin) { doc.addPage({ size: 'A4', layout: 'portrait', margin: 40 }); y = margin; }
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(title, margin, y);
    doc.rect(margin, y + 14, contentW, 1).fill('#e0e0e0');
    y += 20;
    const maxVal = entries[0] ? entries[0][1] : 1;
    const barW = contentW - 130;
    entries.slice(0, 8).forEach(function(entry) {
      const label = entry[0], count = entry[1];
      doc.font('Helvetica').fontSize(8).fillColor(INK).text(String(label || 'Sin datos'), margin, y + 2, { width: 120, lineBreak: false, ellipsis: true });
      doc.rect(margin + 124, y, barW * count / maxVal, 12).fill(color);
      doc.rect(margin + 124, y, barW, 12).lineWidth(0.5).stroke('#e8e8e8');
      doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text(String(count), margin + 124 + barW + 6, y + 2);
      y += 16;
    });
    if (!entries.length) { doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Sin datos', margin, y); y += 16; }
    y += 10;
  }
  const rMap = {}; data.forEach(v => { if (v.resultado) rMap[v.resultado] = (rMap[v.resultado] || 0) + 1; });
  drawBreakdown('Distribucion de Resultados', Object.entries(rMap).sort((a, b) => b[1] - a[1]), ACCENT2);
  const bMap = {}; data.forEach(v => { if (v.barrio) bMap[v.barrio] = (bMap[v.barrio] || 0) + 1; });
  drawBreakdown('Visitas por Barrio / Zona', Object.entries(bMap).sort((a, b) => b[1] - a[1]), ACCENT2);
  const pMap = {}; data.forEach(v => (v.productos || []).forEach(p => { pMap[p] = (pMap[p] || 0) + 1; }));
  drawBreakdown('Productos / Servicios Ofrecidos', Object.entries(pMap).sort((a, b) => b[1] - a[1]), ACCENT);
  const ruMap = {}; data.forEach(v => { if (v.contactoRubro) ruMap[v.contactoRubro] = (ruMap[v.contactoRubro] || 0) + 1; });
  drawBreakdown('Rubros / Industrias Visitadas', Object.entries(ruMap).sort((a, b) => b[1] - a[1]), GOLD);
  const range = doc.bufferedPageRange();
  for (let p = 0; p < range.count; p++) {
    doc.switchToPage(p);
    doc.font('Helvetica').fontSize(7).fillColor(MUTED).text('DarAval - Analisis Comercial  -  Pag. ' + (p + 1) + ' de ' + range.count, margin, pageH - 30, { width: contentW, align: 'center' });
  }
  doc.end();
});

module.exports = router;
