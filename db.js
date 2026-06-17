const sqlite3 = require('sqlite3');
const { Pool } = require('pg');
const { promisify } = require('util');
const path = require('path');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, 'tracker.db');
const USE_POSTGRES = !!process.env.DATABASE_URL;

// PostgreSQL pool (lazy initialized)
let pgPool = null;

function getPgPool() {
  if (!pgPool && USE_POSTGRES) {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pgPool;
}

function openDatabase() {
  if (USE_POSTGRES) {
    return { type: 'postgres', pool: getPgPool() };
  }
  const db = new sqlite3.Database(DB_PATH);
  db.runAsync = promisify(db.run.bind(db));
  db.getAsync = promisify(db.get.bind(db));
  db.allAsync = promisify(db.all.bind(db));
  db.execAsync = promisify(db.exec.bind(db));
  db.closeAsync = promisify(db.close.bind(db));
  return { type: 'sqlite', db };
}

async function ensureColumn(dbObj, table, column, definition) {
  if (USE_POSTGRES) {
    const pool = dbObj.pool;
    try {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }
  } else {
    const db = dbObj.db;
    const columns = await db.allAsync(`PRAGMA table_info(${table})`);
    if (!columns.some((col) => col.name === column)) {
      try {
        await db.runAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      } catch (error) {
        if (!error.message.includes('UNIQUE')) {
          throw error;
        }
        const cleanDef = definition.replace(' UNIQUE', '');
        await db.runAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${cleanDef}`);
      }
    }
  }
}

async function initDatabase() {
  const dbObj = openDatabase();

  if (USE_POSTGRES) {
    const pool = dbObj.pool;
    
    // Create tables with PostgreSQL syntax
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin','security','student')),
        phone_number TEXT,
        registration_number TEXT
      );

      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        location TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('lost','found')),
        status TEXT NOT NULL,
        created_by INTEGER NOT NULL,
        assigned_to INTEGER,
        created_at TEXT NOT NULL,
        image_path TEXT,
        contact_phone TEXT,
        claim_requested_by INTEGER,
        claim_requested_at TEXT,
        archived_at TEXT,
        FOREIGN KEY(created_by) REFERENCES users(id),
        FOREIGN KEY(assigned_to) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS claims (
        id SERIAL PRIMARY KEY,
        report_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        FOREIGN KEY(report_id) REFERENCES reports(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `);

    // Seed users
    const adminPasswordHash = await bcrypt.hash('THEFABULOUS', 10);
    const securityPasswordHash = await bcrypt.hash('security@24', 10);
    const studentPasswordHash = await bcrypt.hash('student@24', 10);

    try {
      await pool.query(
        'INSERT INTO users (full_name, email, username, password, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO UPDATE SET password = $4, role = $5',
        ['System Administrator', 'admin@kabianga.ac.ke', 'admin', adminPasswordHash, 'admin']
      );
    } catch (e) {
      // Handle case where ON CONFLICT is not supported, use UPDATE separately
      const existing = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
      if (existing.rows.length === 0) {
        await pool.query(
          'INSERT INTO users (full_name, email, username, password, role) VALUES ($1, $2, $3, $4, $5)',
          ['System Administrator', 'admin@kabianga.ac.ke', 'admin', adminPasswordHash, 'admin']
        );
      } else {
        await pool.query(
          'UPDATE users SET password = $1, role = $2 WHERE username = $3',
          [adminPasswordHash, 'admin', 'admin']
        );
      }
    }

    try {
      await pool.query(
        'INSERT INTO users (full_name, email, username, password, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO UPDATE SET password = $4, role = $5',
        ['Security Officer', 'security@kabianga.ac.ke', 'security', securityPasswordHash, 'security']
      );
    } catch (e) {
      const existing = await pool.query('SELECT id FROM users WHERE username = $1', ['security']);
      if (existing.rows.length === 0) {
        await pool.query(
          'INSERT INTO users (full_name, email, username, password, role) VALUES ($1, $2, $3, $4, $5)',
          ['Security Officer', 'security@kabianga.ac.ke', 'security', securityPasswordHash, 'security']
        );
      } else {
        await pool.query(
          'UPDATE users SET password = $1, role = $2 WHERE username = $3',
          [securityPasswordHash, 'security', 'security']
        );
      }
    }

    try {
      await pool.query(
        'INSERT INTO users (full_name, email, username, password, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO UPDATE SET password = $4, role = $5',
        ['Sample Student', 'student@students.kabianga.ac.ke', 'student', studentPasswordHash, 'student']
      );
    } catch (e) {
      const existing = await pool.query('SELECT id FROM users WHERE username = $1', ['student']);
      if (existing.rows.length === 0) {
        await pool.query(
          'INSERT INTO users (full_name, email, username, password, role) VALUES ($1, $2, $3, $4, $5)',
          ['Sample Student', 'student@students.kabianga.ac.ke', 'student', studentPasswordHash, 'student']
        );
      } else {
        await pool.query(
          'UPDATE users SET password = $1, role = $2 WHERE username = $3',
          [studentPasswordHash, 'student', 'student']
        );
      }
    }
  } else {
    const db = dbObj.db;
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

    await ensureColumn(dbObj, 'users', 'email', 'TEXT UNIQUE');
    await ensureColumn(dbObj, 'users', 'phone_number', 'TEXT');
    await ensureColumn(dbObj, 'users', 'registration_number', 'TEXT');
    await ensureColumn(dbObj, 'reports', 'image_path', 'TEXT');
    await ensureColumn(dbObj, 'reports', 'contact_phone', 'TEXT');
    await ensureColumn(dbObj, 'reports', 'claim_requested_by', 'INTEGER');
    await ensureColumn(dbObj, 'reports', 'claim_requested_at', 'TEXT');
    await ensureColumn(dbObj, 'reports', 'archived_at', 'TEXT');

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
}

async function openDatabaseAsync() {
  const dbObj = openDatabase();

  if (USE_POSTGRES) {
    const pool = dbObj.pool;
    return {
      get: async (sql, ...params) => {
        // Convert SQLite parameter placeholders to PostgreSQL
        let pgSql = sql;
        let paramIndex = 1;
        pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
        
        const result = await pool.query(pgSql, params);
        return result.rows[0] || null;
      },
      all: async (sql, ...params) => {
        let pgSql = sql;
        let paramIndex = 1;
        pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
        
        const result = await pool.query(pgSql, params);
        return result.rows;
      },
      run: async (sql, ...params) => {
        let pgSql = sql;
        let paramIndex = 1;
        pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
        
        return await pool.query(pgSql, params);
      },
      close: async () => {
        // Don't close the pool as it's reused
      }
    };
  } else {
    const db = dbObj.db;
    return {
      get: db.getAsync.bind(db),
      all: db.allAsync.bind(db),
      run: async function (sql, ...params) {
        return db.runAsync(sql, ...params);
      },
      close: db.closeAsync.bind(db),
    };
  }
}

module.exports = { openDatabase: openDatabaseAsync, initDatabase };
