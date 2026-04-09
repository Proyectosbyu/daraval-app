const express = require('express');
const { db, parseVisita } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/visitas
// Admin: gets all visitas, optionally filtered by ?userId=X
// Ejecutivo: gets only own visitas
router.get('/', requireAuth, (req, res) => {
  let rows;
  if (req.user.rol === 'admin') {
    const { userId } = req.query;
    if (userId) {
      rows = db.prepare('SELECT * FROM visitas WHERE userId = ? ORDER BY fecha DESC, hora DESC, createdAt DESC').all(parseInt(userId));
    } else {
      rows = db.prepare('SELECT * FROM visitas ORDER BY fecha DESC, hora DESC, createdAt DESC').all();
    }
  } else {
    rows = db.prepare('SELECT * FROM visitas WHERE userId = ? ORDER BY fecha DESC, hora DESC, createdAt DESC').all(req.user.id);
  }
  res.json(rows.map(parseVisita));
});

// POST /api/visitas
router.post('/', requireAuth, (req, res) => {
  const v = req.body;
  if (!v.barrio || !v.contactoEmpresa) {
    return res.status(400).json({ error: 'Barrio y empresa son requeridos' });
  }

  const result = db.prepare(`
    INSERT INTO visitas
      (userId, ejecutivo, fecha, hora, barrio, direccion, tipoVisita,
       contactoNombre, contactoCargo, contactoEmpresa, contactoTel, contactoEmail,
       contactoRubro, productos, resultado, proximaAccion, fechaSeguimiento, notas, montoPotencial)
    VALUES
      (@userId, @ejecutivo, @fecha, @hora, @barrio, @direccion, @tipoVisita,
       @contactoNombre, @contactoCargo, @contactoEmpresa, @contactoTel, @contactoEmail,
       @contactoRubro, @productos, @resultado, @proximaAccion, @fechaSeguimiento, @notas, @montoPotencial)
  `).run({
    userId:          req.user.id,
    ejecutivo:       v.ejecutivo || req.user.nombre || '',
    fecha:           v.fecha || '',
    hora:            v.hora || '',
    barrio:          v.barrio || '',
    direccion:       v.direccion || '',
    tipoVisita:      v.tipoVisita || '',
    contactoNombre:  v.contactoNombre || '',
    contactoCargo:   v.contactoCargo || '',
    contactoEmpresa: v.contactoEmpresa || '',
    contactoTel:     v.contactoTel || '',
    contactoEmail:   v.contactoEmail || '',
    contactoRubro:   v.contactoRubro || '',
    productos:       JSON.stringify(Array.isArray(v.productos) ? v.productos : []),
    resultado:       v.resultado || '',
    proximaAccion:   v.proximaAccion || '',
    fechaSeguimiento:v.fechaSeguimiento || '',
    notas:           v.notas || '',
    montoPotencial:  parseFloat(v.montoPotencial) || 0,
  });

  const newRow = db.prepare('SELECT * FROM visitas WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(parseVisita(newRow));
});

// DELETE /api/visitas/:id
// Admin can delete any; ejecutivo can only delete own
router.delete('/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const row = db.prepare('SELECT userId FROM visitas WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Visita no encontrada' });
  if (req.user.rol !== 'admin' && row.userId !== req.user.id) {
    return res.status(403).json({ error: 'No tenés permiso para eliminar esta visita' });
  }
  db.prepare('DELETE FROM visitas WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
