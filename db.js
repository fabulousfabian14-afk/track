const sqlite3 = require('sqlite3');
const { promisify } = require('util');
const path = require('path');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, 'tracker.db');

function openDatabase() {
  const db = new sqlite3.Database(DB_PATH);
  db.runAsync = promisify(db.run.bind(db));
  db.getAsync = promisify(db.get.bind(db));
  db.allAsync = promisify(db.all.bind(db));
  db.execAsync = promisify(db.exec.bind(db));
  db.closeAsync = promisify(db.close.bind(db));
  return db;
}

async function ensureColumn(db, table, column, definition) {
  const columns = await db.allAsync(`PRAGMA table_info(${table})`);
  if (!columns.some((col) => col.name === column)) {
    try {
      await db.runAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      if (!error.message.includes('UNIQUE')) {
        throw error;
      }
      // If UNIQUE constraint fails, just add without unique constraint
      const cleanDef = definition.replace(' UNIQUE', '');
      await db.runAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${cleanDef}`);
    }
  }
}

async function initDatabase() {
  const db = openDatabase();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','security','student'))
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      location TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('lost','found')),
      status TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      assigned_to INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY(created_by) REFERENCES users(id),
      FOREIGN KEY(assigned_to) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY(report_id) REFERENCES reports(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  await ensureColumn(db, 'users', 'email', 'TEXT UNIQUE');
  await ensureColumn(db, 'users', 'phone_number', 'TEXT');
  await ensureColumn(db, 'users', 'registration_number', 'TEXT');
  await ensureColumn(db, 'reports', 'image_path', 'TEXT');
  await ensureColumn(db, 'reports', 'contact_phone', 'TEXT');
  await ensureColumn(db, 'reports', 'claim_requested_by', 'INTEGER');
  await ensureColumn(db, 'reports', 'claim_requested_at', 'TEXT');
  await ensureColumn(db, 'reports', 'archived_at', 'TEXT');

  const adminPasswordHash = await bcrypt.hash('THEFABULOUS', 10);
  const securityPasswordHash = await bcrypt.hash('security@24', 10);

  const admin = await db.getAsync('SELECT id FROM users WHERE username = ?', 'admin');
  if (!admin) {
    await db.runAsync('INSERT INTO users (full_name, email, username, password, role) VALUES (?, ?, ?, ?, ?)', 'System Administrator', 'admin@kabianga.ac.ke', 'admin', adminPasswordHash, 'admin');
  } else {
    await db.runAsync('UPDATE users SET password = ?, role = ? WHERE username = ?', adminPasswordHash, 'admin', 'admin');
  }

  const security = await db.getAsync('SELECT id FROM users WHERE username = ?', 'security');
  if (!security) {
    await db.runAsync('INSERT INTO users (full_name, email, username, password, role) VALUES (?, ?, ?, ?, ?)', 'Security Officer', 'security@kabianga.ac.ke', 'security', securityPasswordHash, 'security');
  } else {
    await db.runAsync('UPDATE users SET password = ?, role = ? WHERE username = ?', securityPasswordHash, 'security', 'security');
  }

  const student = await db.getAsync('SELECT id FROM users WHERE username = ?', 'student');
  if (!student) {
    const password = await bcrypt.hash('student@24', 10);
    await db.runAsync('INSERT INTO users (full_name, email, username, password, role) VALUES (?, ?, ?, ?, ?)', 'Sample Student', 'student@students.kabianga.ac.ke', 'student', password, 'student');
  }

  await db.closeAsync();
}

async function openDatabaseAsync() {
  const db = openDatabase();
  return {
    get: db.getAsync.bind(db),
    all: db.allAsync.bind(db),
    run: async function (sql, ...params) {
      return db.runAsync(sql, ...params);
    },
    close: db.closeAsync.bind(db),
  };
}

module.exports = { openDatabase: openDatabaseAsync, initDatabase };
