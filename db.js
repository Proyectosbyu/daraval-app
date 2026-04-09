const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'fieldlog.db');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre       TEXT    NOT NULL,
    email        TEXT    NOT NULL UNIQUE,
    passwordHash TEXT    NOT NULL,
    rol          TEXT    NOT NULL DEFAULT 'ejecutivo',
    createdAt    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS visitas (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    userId           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ejecutivo        TEXT,
    fecha            TEXT,
    hora             TEXT,
    barrio           TEXT,
    direccion        TEXT,
    tipoVisita       TEXT,
    contactoNombre   TEXT,
    contactoCargo    TEXT,
    contactoEmpresa  TEXT,
    contactoTel      TEXT,
    contactoEmail    TEXT,
    contactoRubro    TEXT,
    productos        TEXT    NOT NULL DEFAULT '[]',
    resultado        TEXT,
    proximaAccion    TEXT,
    fechaSeguimiento TEXT,
    notas            TEXT,
    montoPotencial   REAL    NOT NULL DEFAULT 0,
    createdAt        TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// Seed admin user on first run
const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@fieldlog.com');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (nombre, email, passwordHash, rol) VALUES (?, ?, ?, ?)')
    .run('Administrador', 'admin@fieldlog.com', hash, 'admin');
  console.log('  [db] Admin creado: admin@fieldlog.com / admin123');
}

function parseVisita(row) {
  if (!row) return null;
  try { row.productos = JSON.parse(row.productos || '[]'); } catch { row.productos = []; }
  return row;
}

module.exports = { db, parseVisita };
