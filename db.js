const initSqlJs = require('sql.js');
const fs        = require('fs');
const path      = require('path');
const bcrypt    = require('bcryptjs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'fieldlog.db');

let _sqlDb = null; // sql.js Database instance (in-memory)

// Persist the in-memory database to disk after every write
function save() {
  const data = _sqlDb.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

// Normalize binding params so both calling styles work:
//   positional  →  db.prepare(sql).run(1, 2, 3)   or  .run([1,2,3])
//   named       →  db.prepare(sql).run({ userId: 1 })  (keys get @ prefix)
function normalizeParams(args) {
  if (args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    // Named params object: { key: val } → { '@key': val }
    const out = {};
    for (const [k, v] of Object.entries(args[0])) {
      out[k.startsWith('@') || k.startsWith('$') || k.startsWith(':') ? k : `@${k}`] = v;
    }
    return out;
  }
  // Positional: flatten in case an array was passed as single arg
  return args.flat();
}

// better-sqlite3-compatible wrapper around sql.js
const db = {
  exec(sql) {
    _sqlDb.exec(sql);
  },

  pragma(str) {
    _sqlDb.run(`PRAGMA ${str}`);
  },

  prepare(sql) {
    return {
      get(...args) {
        const params = normalizeParams(args);
        const stmt   = _sqlDb.prepare(sql);
        const hasLen = Array.isArray(params) ? params.length : Object.keys(params).length;
        if (hasLen) stmt.bind(params);
        const found  = stmt.step();
        const result = found ? stmt.getAsObject() : undefined;
        stmt.free();
        return result;
      },

      all(...args) {
        const params = normalizeParams(args);
        const stmt   = _sqlDb.prepare(sql);
        const hasLen = Array.isArray(params) ? params.length : Object.keys(params).length;
        if (hasLen) stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push({ ...stmt.getAsObject() });
        stmt.free();
        return rows;
      },

      run(...args) {
        const params = normalizeParams(args);
        const stmt   = _sqlDb.prepare(sql);
        const hasLen = Array.isArray(params) ? params.length : Object.keys(params).length;
        if (hasLen) stmt.bind(params);
        stmt.step();
        stmt.free();
        const changes          = _sqlDb.getRowsModified();
        const lastInsertRowid  = _sqlDb.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? 0;
        save();
        return { lastInsertRowid, changes };
      },
    };
  },
};

// ── Async init: called once from server.js before app.listen ──────────────
async function init() {
  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    _sqlDb = new SQL.Database(fileBuffer);
  } else {
    _sqlDb = new SQL.Database();
  }

  _sqlDb.run('PRAGMA foreign_keys = ON');

  _sqlDb.exec(`
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
  const adminStmt = _sqlDb.prepare('SELECT id FROM users WHERE email = ?');
  adminStmt.bind(['admin@fieldlog.com']);
  const adminExists = adminStmt.step();
  adminStmt.free();

  if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 10);
    _sqlDb.run(
      'INSERT INTO users (nombre, email, passwordHash, rol) VALUES (?, ?, ?, ?)',
      ['Administrador', 'admin@fieldlog.com', hash, 'admin']
    );
    console.log('  [db] Admin creado: admin@fieldlog.com / admin123');
  }

  save();
  console.log(`  [db] Base de datos lista: ${dbPath}`);
}

function parseVisita(row) {
  if (!row) return null;
  try { row.productos = JSON.parse(row.productos || '[]'); } catch { row.productos = []; }
  return row;
}

module.exports = { db, parseVisita, init };
