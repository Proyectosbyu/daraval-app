const express = require('express');
const { db, parseVisita } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const RESULTADOS_VALIDOS = ['Propuesta entregada', 'Requiere seguimiento', 'Sin interés', 'Contrato cerrado'];

// GET /api/visitas
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

// PUT /api/visitas/:id — editar todos los campos
router.put('/:id', requireAuth, (req, res) => {
  const id  = parseInt(req.params.id);
  const row = db.prepare('SELECT userId FROM visitas WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Visita no encontrada' });
  if (req.user.rol !== 'admin' && row.userId !== req.user.id) {
    return res.status(403).json({ error: 'No tenés permiso para editar esta visita' });
  }
  const b = req.body;
  if (!b.barrio || !b.contactoEmpresa) {
    return res.status(400).json({ error: 'Barrio y empresa son requeridos' });
  }
  db.prepare(`
    UPDATE visitas SET
      ejecutivo=@ejecutivo, fecha=@fecha, hora=@hora, barrio=@barrio,
      direccion=@direccion, tipoVisita=@tipoVisita,
      contactoNombre=@contactoNombre, contactoCargo=@contactoCargo,
      contactoEmpresa=@contactoEmpresa, contactoTel=@contactoTel,
      contactoEmail=@contactoEmail, contactoRubro=@contactoRubro,
      productos=@productos, resultado=@resultado,
      proximaAccion=@proximaAccion, fechaSeguimiento=@fechaSeguimiento,
      notas=@notas, montoPotencial=@montoPotencial
    WHERE id=@id
  `).run({
    id,
    ejecutivo:       b.ejecutivo       || '',
    fecha:           b.fecha           || '',
    hora:            b.hora            || '',
    barrio:          b.barrio          || '',
    direccion:       b.direccion       || '',
    tipoVisita:      b.tipoVisita      || '',
    contactoNombre:  b.contactoNombre  || '',
    contactoCargo:   b.contactoCargo   || '',
    contactoEmpresa: b.contactoEmpresa || '',
    contactoTel:     b.contactoTel     || '',
    contactoEmail:   b.contactoEmail   || '',
    contactoRubro:   b.contactoRubro   || '',
    productos:       JSON.stringify(Array.isArray(b.productos) ? b.productos : []),
    resultado:       RESULTADOS_VALIDOS.includes(b.resultado) ? b.resultado : '',
    proximaAccion:   b.proximaAccion   || '',
    fechaSeguimiento:b.fechaSeguimiento|| '',
    notas:           b.notas           || '',
    montoPotencial:  parseFloat(b.montoPotencial) || 0,
  });
  const updated = db.prepare('SELECT * FROM visitas WHERE id = ?').get(id);
  res.json(parseVisita(updated));
});

// PATCH /api/visitas/:id — actualizar resultado
router.patch('/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const row = db.prepare('SELECT userId FROM visitas WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Visita no encontrada' });
  if (req.user.rol !== 'admin' && row.userId !== req.user.id) {
    return res.status(403).json({ error: 'No tenés permiso para editar esta visita' });
  }
  const { resultado } = req.body;
  if (!resultado || !RESULTADOS_VALIDOS.includes(resultado)) {
    return res.status(400).json({ error: 'Resultado inválido' });
  }
  db.prepare('UPDATE visitas SET resultado = ? WHERE id = ?').run(resultado, id);
  const updated = db.prepare('SELECT * FROM visitas WHERE id = ?').get(id);
  res.json(parseVisita(updated));
});

// DELETE /api/visitas/:id
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
