const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ token, user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol } });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, nombre, email, rol, createdAt FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(user);
});

// GET /api/auth/users  (admin only)
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.nombre, u.email, u.rol, u.createdAt,
           COUNT(v.id) as visitCount
    FROM users u
    LEFT JOIN visitas v ON v.userId = u.id
    GROUP BY u.id
    ORDER BY u.nombre
  `).all();
  res.json(users);
});

// POST /api/auth/users  (admin only)
router.post('/users', requireAuth, requireAdmin, (req, res) => {
  const { nombre, email, password, rol = 'ejecutivo' } = req.body;
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
  }
  if (!['ejecutivo', 'admin'].includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (exists) return res.status(409).json({ error: 'Ya existe un usuario con ese email' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (nombre, email, passwordHash, rol) VALUES (?, ?, ?, ?)')
    .run(nombre.trim(), email.toLowerCase().trim(), hash, rol);

  res.status(201).json({ id: result.lastInsertRowid, nombre, email, rol });
});

// DELETE /api/auth/users/:id  (admin only)
router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'No podés eliminar tu propio usuario' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

// PATCH /api/auth/users/:id/password  (admin only)
router.patch('/users/:id/password', requireAuth, requireAdmin, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(hash, parseInt(req.params.id));
  res.json({ ok: true });
});

module.exports = router;
